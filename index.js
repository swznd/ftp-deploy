const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const path = require('path');
const micromatch = require('micromatch');
const { Readable, Transform } = require('stream');
const PromiseFTP = require("promise-ftp");

(async () => {
  let client = new PromiseFTP();
  let connected = false;

  try {
    const host = core.getInput('host');
    const port = core.getInput('port');
    const user = core.getInput('user');
    const password = core.getInput('password');
    const secure = core.getInput('secure');
    const localPath = core.getInput('local_path');
    const remotePath = (core.getInput('remote_path') || '').trim('/');
    const ignore = (core.getInput('ignore') || '').split(',').filter(Boolean);
    const remoteRev = core.getInput('remote_revision');
    const payload = github.context.payload;

    await client.connect({
      host: host,
      port: port || 21,
      user: user,
      password: password,
      secure: secure || true,
      autoReconnect: true,
      preserveCwd: true
    });
    connected = true;

    let start = '';

    if (remoteRev == '') {
      start = remoteRev;
    }
    else {
      const st = new Transform();
      st._transform = function (chunk,encoding,done)  {
        this.push(chunk)
        done();
      };
      await client.downloadTo(st, remotePath + '/.revision');
      const remoteHash = new Promise((resolve, reject) => {
        st.on('end', resolve(st.read()));
        st.on('error', reject)
      });
      start = await remoteHash;
    }

    console.log('Remote Revision:', start.toString());

    const end = payload.after;
    
    if (start == '') {
      console.log('Remote revision empty, get from initial commit');
      start = (await git('hash-object', '-t', 'tree', '/dev/null')).trim();
    }
    
    console.log('Comparing', `${start}..${end}`);

    const modified = await git('diff', '--name-only', '--diff-filter=AM', '-M100%', start, end);
    const deleted = await git('diff-tree', '--name-only', '--diff-filter=D', '-t', start, end);
  
    const filterFile = file => {
      if (file === '') return false;
      if (['', './', '.'].indexOf(localPath) !== -1 && !file.startsWith(localPath)) return false;
      if (ignore.length && micromatch.isMatch(file, ignore)) return false;
      return true;
    }

    const filteredModified = modified.split("\n").filter(filterFile);
    const filteredDeleted = deleted.split("\n").filter(filterFile);
  
    console.log('fiteredModified', filteredModified, 'filteredDeleted', filteredDeleted);
    // if (filteredModified.length === 0 && filteredDeleted.length === 0) {
    //   console.log('No Changes');
    // }
    // else {
    //   for (let i = 0; i < filteredDeleted.length; i++) {
    //     const file = filteredDeleted[i];
    //     const remoteFile = remotePath + '/' + file;
    //     const checkRemoteFile = await isExists(remoteFile);

    //     if ( ! checkRemoteFile) continue;
        
    //     if (checkRemoteFile == 'd') {
    //       await client.rmdir(remoteFile, true);
    //     }
    //     else {
    //       await client.delete(remoteFile);
    //     }
    //     console.log('Deleted: ' + file);
    //   }

    //   for (let i = 0; i < filteredModified.length; i++) {
    //     const file = filteredModified[i];
    //     const remoteFile = remotePath + '/' + file;
    //     const remoteFilePath = path.dirname(remoteFile);
    //     const checkRemoteFilePath = await isExists(remoteFilePath);
        
    //     if (checkRemoteFilePath != 'd') {
    //       if (checkRemoteFilePath) {
    //         await client.delete(remoteFilePath);
    //       }

    //       await client.rmdir(remoteFilePath, true);
    //     }

    //     await client.put(file, remoteFile);
    //     console.log('Uploaded: ' + file);
    //   }
    // }

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

      client.listSafe(filePath).then(lists => {
        for(list in lists) {
          if (list.name == fileName) {
            resolve(list.type);
            break;
          }
        }

        resolve(false);
      }).catch(reject);
    });
  }
});