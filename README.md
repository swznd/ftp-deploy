# Fast FTP Deploy 

Upload only changes to FTP Server

It will check if the remote path has `.revision`, will download and compare the hash from that file with the new commit hash, then upload the changes to remote server, and update the `.revision` in the remote server. If there is no `.revision` it will compare and upload from the initial commit

## Inputs

### `host`

**Required** Hostname or ip address ftp server

### `port`

Port number ftp server. Default `21`

### `user`

**Required** Username to login ftp server

### `password`

Password to login ftp server

### `secure`

SSL/TLS options

### `localPath`

Root local directory to deploy, default is your root project

### `remotePath`

Root remote directory ftp server, default is depend your default home user

### `ignore`

Ignore files, support glob wildcard, separated by comma each pattern. default: `.github/**,.gitignore,**/.gitignore`

### `remote_revision`

Remote revision hash


## Action Example

### Simple Action

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
          host: ftp.example.com
          user: username
          password: ${{ secrets.FTP_PASSWORD }}
          ignore: .github/**
```

### Fast Action

The `.revision` file need can be accessed via web

```
name: deploy

on:
  push:
    branches: [ master ]

env:
  TOTAL_COMMITS: "-1"

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - id: fetch_revision
      name: fetch revision
      run: echo ::set-output name=revision::$(curl -m 15 https://example.com/.revision)
    - id: get_total_commit_ahead
      name: fetch total commits count
      uses: octokit/request-action@v2.x
      if: steps.fetch_revision.outputs.revision != ''
      with:
        route: GET /repos/:repository/compare/:base...:head
        repository: ${{ github.repository }}
        base: ${{ steps.fetch_revision.outputs.revision }}
        head: ${{ github.sha }}
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    - id: parse_total_commit_ahead
      uses: gr2m/get-json-paths-action@v1.x
      if: steps.fetch_revision.outputs.revision != ''
      with:
        json: ${{ steps.get_total_commit_ahead.outputs.data }}
        total_commits: "total_commits"
    - name: set total_commit
      run: "echo ::set-env name=TOTAL_COMMITS::$(( ${{ steps.parse_total_commit_ahead.outputs.total_commits }} + 1 ))"
    - uses: actions/checkout@v2
      with:
        fetch-depth: ${{ env.TOTAL_COMMITS }}
    - name: upload
      uses: swznd/ftp-deploy@master
      with:
        host: ftp.example.com
        user: user
        password: ${{ secrets.FTP_ZEOBOT_PASSWORD }}
```

## Other Deployment Actions

SFTP Deployment: https://github.com/swznd/sftp-deploy/