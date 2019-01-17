/* eslint no-console: 0 */
/* eslint max-len: 0 */
import path from 'path';
import fs from 'fs';

import program from 'commander';
import minimatch from 'minimatch';
import pkg from '../package.json';
import * as LinkHeader from 'http-link-header';
const URL = require('url-parse');
import * as mime from 'mime-types';

import Octokit from '@octokit/rest';
const octokit = new Octokit();

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .option('-T, --token <token>', 'OAuth2 token')
    .option('-o, --owner <owner>', 'owner')
    .option('-r, --repo <repo>', 'repo')
    .option('-t, --tag <tag>', 'tag')
    .option('-n, --name <name>', 'name')
    .option('-b, --body <body>', 'body', false)
    .option('-a, --anonymous', 'Use github API without token mainly for testing', false)
    .option('-d, --draft [value]', 'draft', function(val) {
        if (String(val).toLowerCase() === 'false') {
            return false;
        }
        return true;
    })
    .option('-p, --prerelease [value]', 'prerelease', function(val) {
        if (String(val).toLowerCase() === 'false') {
            return false;
        }
        return true;
    });

program.parse(process.argv);

const [command, ...args] = program.args;

if (!program.anonymous) {
    octokit.authenticate({
        type: 'oauth',
        token: program.token || process.env.GITHUB_TOKEN
    });
}

function next(response) {
  if (!response.headers || !response.headers.link) return false;

  let link = LinkHeader.parse(response.headers.link).rel('next');
  if (!link) return false;
  link = URL(link[0].uri, null, true).query
  if (!link) return false;
  return parseInt(link.page);
}

const fn = {
    'upload': async () => {
        const { owner, repo, tag, name, body, draft, prerelease } = program;
        const files = args;
        let release;

        try {
            console.log('> releases#getReleaseByTag');
            release = await octokit.repos.getReleaseByTag({
                owner: owner,
                repo: repo,
                tag: tag
            });
        } catch (err) {
            // Ignore
        }

        try {
            if (!release) {
                console.log('> releases#createRelease');
                result = await octokit.repos.createRelease({
                    owner,
                    repo,
                    tag_name: tag,
                    name: name || tag,
                    body: body || '',
                    draft: !!draft,
                    prerelease: !!prerelease
                })
            } else {
                console.log('> releases#updateRelease');
                release = await octokit.repos.updateRelease({
                    owner,
                    repo,
                    release_id: release.id,
                    tag_name: tag,
                    name: name || tag,
                    body: (body === undefined) ? release.body || '' : body || '',
                    draft: (draft === undefined) ? !!release.draft : false,
                    prerelease: (prerelease === undefined) ? !!release.prerelease : false,
                })
            }

            if (files.length > 0) {
                console.log('> releases#uploadReleaseAsset');
                for (let i = 0; i < files.length; ++i) {
                    const file = files[i];
                    console.log('#%d name="%s" filePath="%s"', i + 1, path.basename(file), file);

                    await octokit.repos.uploadReleaseAsset({
                        url: release.data.upload_url,
                        file: fs.createReadStream(file),
                        headers: {
                            'content-type': mime.lookup('file') || 'application/octet-stream',
                            'content-length': fs.statSync(file).size,
                        },
                        name: path.basename(asset),
                    });
                }
            }
        } catch (err) {
            console.error(err);
        }
    },
    'delete': async () => {
        const { owner, repo, tag, name, body, draft, prerelease } = program;
        const patterns = args;
        let release;

        try {
            console.log('> releases#getReleaseByTag');
            release = await octokit.repos.getReleaseByTag({
                owner: owner,
                repo: repo,
                tag: tag
            });
        } catch (err) {
            console.error(err);
            return;
        }

        try {
            console.log('> releases#listAssetsForRelease');

            let assets = [];
            let _assets = null;
            let page = 1;
            do {
                let _assets = await octokit.repos.listAssetsForRelease({owner, repo, release_id, per_page, page})
                assets = assets.concat(_assets.data)
                page = next(_assets)
            } while (page)

            const deleteAssets = assets.filter(asset => {
                return patterns.some(pattern => minimatch(asset.name, pattern));
            });
            console.log('assets=%d, deleteAssets=%d', assets.length, deleteAssets.length);

            if (deleteAssets.length > 0) {
                console.log('> releases#deleteReleaseAsset');
                for (let i = 0; i < deleteAssets.length; ++i) {
                    const asset = deleteAssets[i];
                    console.log('#%d', i + 1, {
                        id: asset.id,
                        name: asset.name,
                        label: asset.label,
                        state: asset.state,
                        size: asset.size,
                        download_count: asset.download_count,
                        created_at: asset.created_at,
                        updated_at: asset.updated_at
                    });
                    await octokit.repos.deleteReleaseAsset({owner, repo, asset_id: asset.id })
                }
            }
        } catch (err) {
            console.error(err);
        }
    },
    'list': async () => {
        const releases = await octokit.repos.listReleases({ owner: program.owner, repo: program.repo, page: 1 });
        for (const release of releases.data) {
            console.log(`${release.name} (${release.tag_name})`);
        }
    },
}[command];

async function main() {
  try {
    typeof fn === 'function' && await fn();
  } catch (err) {
    // message has token in the response
    const message = err.message.replace(/https?:[^\s]*/g, (match) => match.replace(/\?.*/, ''))
    console.log(message);
    process.exit(1);
  }
}

main()
