# github-release-cli [![build status](https://travis-ci.org/cheton/github-release-cli.svg?branch=master)](https://travis-ci.org/cheton/github-release-cli)

[![NPM](https://nodei.co/npm/github-release-cli.png?downloads=true&stars=true)](https://www.npmjs.com/package/github-release-cli)

A command-line tool for managing release assets on a GitHub repository.

## Installation

```
npm install -g github-release-cli
```

## Command Line Usage

Run `github-release` with `-h` or `--help` options:

```
Usage: github-release <command> [<args>]

Options:
  -V, --version             output the version number
  --baseurl <baseurl>       API endpoint (default: "https://api.github.com")
  -T, --token <token>       OAuth2 token
  -o, --owner <owner>       owner
  -r, --repo <repo>         repo
  -t, --tag <tag>           tag
  -n, --name <name>         name
  -b, --body <body>         body
  -d, --draft [value]       draft
  -p, --prerelease [value]  prerelease
  -h, --help                output usage information
```

### Upload

```sh
github-release upload \
  --owner cheton \
  --repo github-release-cli \
  --tag "v0.1.0" \
  --name "v0.1.0" \
  --body "This release contains bug fixes and imporvements, including:\n..." \
  archive.zip index.html app.min.css app.min.js
```

#### Create a prerelease

```sh
github-release upload \
  --owner cheton \
  --repo github-release-cli \
  --tag "v0.1.0" \
  --name "v0.1.0" \
  --body "This is a prerelease" \
  --prerelease
```

#### Change a prerelease to a published release

```sh
github-release upload \
  --owner cheton \
  --repo github-release-cli \
  --tag "v0.1.0" \
  --name "v0.1.0" \
  --body "This is a published release" \
  --prerelease=false
```

### Delete

You can use glob expressions to match files:
```sh
github-release delete \
  --owner cheton \
  --repo github-release-cli \
  --tag "v0.1.0" \
  --name "v0.1.0" \
  archive.zip index.html "app.*"
```

## Examples

https://github.com/cncjs/cncjs-pendant-tinyweb/blob/master/.travis.yml

## Secure Setup

### 1. Get an OAuth token from GitHub

First you will need to get an OAuth Token from GitHub using your own username and "note":

```sh
curl \
  -u 'username' \
  -d '{"scopes":["repo"], "note":"Publish to GitHub Releases"}' \
  https://api.github.com/authorizations
```

For users with two-factor authentication enabled, you must send the user's authentication code (i.e., one-time password) in the `X-GitHub-OTP` header:

```sh
curl \
  -u 'username' \
  -H 'X-GitHub-OTP: 000000' \
  -d '{"scopes":["repo"], "note":"Publish to GitHub Releases"}' \
  https://api.github.com/authorizations
```

### 2. Storing the OAuth token in an environment variable

For reducing security risks, you can store your OAuth token in an environment variable.

Export the token using the one you got from above:

```sh
export GITHUB_TOKEN=your_token
```

### 3. Set up a CI build

Now you're ready to upload assets to a GitHub repository from a CI server. For example:

```sh
COMMIT_LOG=`git log -1 --format='%ci %H %s'`
github-release upload \
  --owner=cheton \
  --repo=github-release-cli \
  --tag="latest" \
  --name="${TRAVIS_BRANCH}" \
  --body="${COMMIT_LOG}" \
  "releases/myapp-0.1.0-win-x32.exe" \
  "releases/myapp-0.1.0-win-x64.exe"
```

If you're using Travis CI, you may want to encrypt environment variables:

```sh
travis encrypt GITHUB_TOKEN=your_token
```

Learn how to define encrypted variables in .travis.yml:<br>
https://docs.travis-ci.com/user/environment-variables/#Defining-encrypted-variables-in-.travis.yml

## License

MIT
