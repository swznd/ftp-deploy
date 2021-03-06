const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const path = require('path');
const micromatch = require('micromatch');
const { Readable } = require('stream');
const PromiseFTP = require("promise-ftp");

(async () => {
  let client = new PromiseFTP();
  let connected = false;
  const deletedLogs = { dirs: [], files: [] };

  try {
    const host = core.getInput('host');
    const port = core.getInput('port');
    const user = core.getInput('user');
    const password = core.getInput('password');
    const secure = core.getInput('secure');
    const localPath = trimChar((core.getInput('local_path') || ''), '/').trim();
    const remotePath = trimChar((core.getInput('remote_path') || ''), '/').trim();
    const ignore = (core.getInput('ignore') || '').split(',').filter(Boolean);
    const remoteRev = core.getInput('remote_revision');
    const payload = github.context.payload;

    await client.connect({
      host: host,
      port: port || 21,
      user: user,
      password: password,
      secure: secure,
      autoReconnect: true,
      preserveCwd: true
    });
    connected = true;

    console.log('Connected. Current Working Directory:', await client.pwd());

    let start = '';

    if (remoteRev != '') {
      start = remoteRev;
    }
    else if (await isExists(remotePath + '/.revision')) {
      console.log('getting last revision from server');
      const st = await client.get(remotePath + '/.revision');
      const remoteHash = new Promise((resolve, reject) => {
        const chunks = [];
        st.on('data', chunk => chunks.push(chunk))
        st.on('error', reject)
        st.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        st.resume();
      });
      start = await remoteHash;
    }
    
    console.log('Remote Revision:', start.toString());

    const end = payload.after;
    
    if (start == '') {
      console.log('Remote revision empty, get from initial commit');
      start = await git('hash-object', '-t', 'tree', '/dev/null');
    }
    
    start = start.trim();

    console.log('Comparing', `${start}..${end}`);

    const modified = await git('diff', '--name-only', '--diff-filter=AMR', '-M100%', start, end);
    const deleted = await git('diff-tree', '--name-only', '--diff-filter=D', '-t', start, end);
  
    const filterFile = file => {
      if (file === '') return false;
      if (['', './', '.'].indexOf(localPath) === -1 && !file.startsWith(localPath)) return false;
      if (ignore.length && micromatch.isMatch(file, ignore)) return false;
      return true;
    }

    const replacePath = file => {
      if (localPath == '') return file;

      const start = new RegExp('^' + localPath + '/');
      return file.replace(start, '');
    }

    const filteredModified = modified.split("\n").filter(filterFile).map(replacePath);
    const filteredDeleted = deleted.split("\n").filter(filterFile).map(replacePath);
  
    if (filteredModified.length === 0 && filteredDeleted.length === 0) {
      console.log('No Changes');
    }
    else {
      for (let i = 0; i < filteredDeleted.length; i++) {
        const file = filteredDeleted[i];
        const remoteFile = remotePath + '/' + file;
        const checkRemoteFile = await isExists(remoteFile);

        if ( ! checkRemoteFile) continue;
        
        if (checkRemoteFile == 'd') {
          await client.rmdir(remoteFile, true);
          deletedLogs.dirs.push(remoteFile);
        }
        else {
          await client.delete(remoteFile);
          deletedLogs.files.push(remoteFile);
        }
        console.log('Deleted: ' + file);
      }

      for (let i = 0; i < filteredModified.length; i++) {
        const file = filteredModified[i];
        const remoteFile = remotePath + '/' + file;
        const remoteFilePath = path.dirname(remoteFile);
        const checkRemoteFilePath = await isExists(remoteFilePath);
        
        if (checkRemoteFilePath != 'd') {
          if (checkRemoteFilePath) {
            console.log('Conflict! it should be directory. Remove file: ' + remoteFilePath);
            await client.delete(remoteFilePath);
          }

          await client.mkdir(remoteFilePath, true);
        }

        await client.put(file, remoteFile);
        console.log('Uploaded: ' + file);
      }
    }

    await client.put(Readable.from(end), remotePath + '/.revision');
    client.end();
  } catch(e) {
    core.setFailed(e.message);
    if (client && connected) client.end();
  }

  function git() {
    return new Promise(async (resolve, reject) => {
      try {
        let output = '';
        let error = '';

        await exec.exec('git', Array.from(arguments), {
          listeners: {
            stdout: (data) => {
              output += data.toString();
            },
            stderr: (data) => {
              error += data.toString();
            }
          },
          silent: false
        });

        if (error.length) {
          return reject(error);
        }

        resolve(output);
      } catch (e) {
        reject(e);
      }
    });
  }

  function isExists(file) {
    return new Promise((resolve, reject) => {
      const filePath = path.dirname(file);
      const fileName = path.basename(file);

      for (let dd of deletedLogs.dirs) {
        if (filePath.startsWith(dd)) return resolve(false);
      }

      for (let df of deletedLogs.files) {
        if (fileName == df) return resolve(false);
      }

      client.list(filePath).then(lists => {
        for(let list of lists) {
          if (list.name == fileName) {
            resolve(list.type);
            break;
          }
        }

        resolve(false);
      }).catch(reject);
    });
  }

  // https://stackoverflow.com/a/32516190
  function trimChar(s, c) {
    if (c === "]") c = "\\]";
    if (c === "\\") c = "\\\\";
    return s.replace(new RegExp(
      "^[" + c + "]+|[" + c + "]+$", "g"
    ), "");
  }
})();