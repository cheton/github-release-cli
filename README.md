# github-release-cli [![build status](https://travis-ci.org/cheton/github-release-cli.svg?branch=master)](https://travis-ci.org/cheton/github-release-cli)

[![NPM](https://nodei.co/npm/github-release-cli.png?downloads=true&stars=true)](https://www.npmjs.com/package/github-release-cli)

A command-line tool for uploading release assets to a GitHub repository.

## Installation

```
npm install -g github-release-cli
```


## Command Line Usage

Run `github-release` with `-h` or `--help` options:

```
Usage: github-release [options] [file ...]

Options:

  -h, --help           output usage information
  -V, --version        output the version number
  -T, --token <token>  OAuth2 token
  -o, --owner <owner>  owner
  -r, --repo <repo>    repo
  -t, --tag <tag>      tag
  -n, --name <name>    name
  -b, --body <body>    body
```

## Secure Setup

### 1. Get an OAuth token from GitHub

First you will need to get an OAuth Token from GitHub using your own username and "note":

```
curl \
  -u 'username' \
  -d '{"scopes":["repo"], "note":"Publish to GitHub Releases"}' \
  https://api.github.com/authorizations
```

For users with two-factor authentication enabled, you must send the user's authentication code (i.e., one-time password) in the `X-GitHub-OTP` header:

```
curl \
  -u 'username' \
  -H 'X-GitHub-OTP: 000000' \
  -d '{"scopes":["repo"], "note":"Publish to GitHub Releases"}' \
  https://api.github.com/authorizations
```

### 2. Storing the OAuth token in an environment variable

For reducing security risks, you can store your OAuth token in an environment variable.

Export the token using the one you got from above:

```
export GITHUB_TOKEN=your_token
```

### 3. Set up a CI build

Now you're ready to upload assets to a GitHub repository from a CI server. For example:

```
COMMIT_LOG=`git log -1 --format='%ci %H %s'`
github-release \
  --owner=cheton \
  --repo=github-release-cli \
  --tag="${TRAVIS_BRANCH}" \
  --name="${TRAVIS_BRANCH}" \
  --body="${COMMIT_LOG}" \
  "releases/file.zip" \
  "releases/file.tar.gz"
```

If you're using Travis CI, you may want to encrypt environment variables:

```
travis encrypt GITHUB_TOKEN=your_token
```

Learn how to define encrypted variables in .travis.yml:<br>
https://docs.travis-ci.com/user/environment-variables/#Defining-encrypted-variables-in-.travis.yml

## Examples

https://github.com/cncjs/cncjs/blob/master/.travis.yml

## License

MIT
