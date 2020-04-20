# FTP Deploy with Respect

Upload to FTP with compare hash from remote server

It will check if the remote path has `.revision`, will download and compare the hash from that file with the new commit hash, then upload the changes to remote server, and update the `.revision` in the remote server. If there is no `.revision` it will compare and upload from the initial commit

## Inputs

### `host`

**Required** Hostname or ip address sftp server

### `port`

Port number sftp server. Default `22`

### `user`

**Required** Username to login sftp server

### `password`

Password to login sftp server

### `secure`

SSL/TLS options

### `localPath`

Root local directory to deploy, default is your root project

### `remotePath`

**Required** Root remote directory sftp server, default is depend your default home user

### `ignore`

Ignore files, support glob wildcard, separated by comma each pattern. example: `ignoreFolder/**,ignoreFile*`


## Action Example

```
on:
  push:
    branches: [ master ]

jobs:
  deploy_job:
    runs-on: ubuntu-latest
    name: deploy
    steps:
      - name: checkout
        uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - name: deploy file
        uses:  swznd/ftp-deploy@master
        with:
          host: ${{ secrets.IP_PROD_SERVER }}
          user: username
          password: ${{ secrets.FTP_PASSWORD }}
          remote_path: /
          ignore: .github/**
```