/* eslint no-console: 0 */
/* eslint max-len: 0 */
import fs from 'fs';
import path from 'path';
import Octokit from '@octokit/rest';
import program from 'commander';
import * as LinkHeader from 'http-link-header';
import * as mime from 'mime-types';
import minimatch from 'minimatch';
import parse from 'url-parse';
import pkg from '../package.json';

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

if (!command !== 'list') {
    octokit.authenticate({
        type: 'oauth',
        token: program.token || process.env.GITHUB_TOKEN
    });
}

function next(response) {
    if (!response.headers || !response.headers.link) {
        return false;
    }

    let link = LinkHeader.parse(response.headers.link).rel('next');
    if (!link) {
        return false;
    }

    const url = parse(link[0].uri, null, true);
    if (!url.query) {
        return false;
    }

    const nextPage = parseInt(url.query.page);
    return nextPage;
}

const fn = {
    'upload': async () => {
        const { owner, repo, tag, name, body, draft, prerelease } = program;
        const files = args;
        let release;

        try {
            console.log(`> getReleaseByTag: owner=${owner}, repo=${repo}, tag=${tag}`);
            const res = await octokit.repos.getReleaseByTag({
                owner: owner,
                repo: repo,
                tag: tag,
            });
            release = res.data;
        } catch (err) {
            // Ignore
        }

        try {
            if (!release) {
                console.log(`> createRelease: tag_name=${tag}, name=${name || tag}, draft=${!!draft}, prerelease=${!!prerelease}`);
                const res = await octokit.repos.createRelease({
                    owner,
                    repo,
                    tag_name: tag,
                    name: name || tag,
                    body: body || '',
                    draft: !!draft,
                    prerelease: !!prerelease,
                });
                release = res.data;
            } else {
                console.log(`> updateRelease: release_id=${release.id}, tag_name=${tag}, name=${name || tag}`);
                const res = await octokit.repos.updateRelease({
                    owner,
                    repo,
                    release_id: release.id,
                    tag_name: tag,
                    name: name || tag,
                    body: (body === undefined) ? release.body || '' : body || '',
                    draft: (draft === undefined) ? !!release.draft : false,
                    prerelease: (prerelease === undefined) ? !!release.prerelease : false,
                });
                release = res.data;
            }

            if (files.length > 0) {
                console.log(`> uploadReleaseAsset: assets_url=${release.assets_url}`);
                for (let i = 0; i < files.length; ++i) {
                    const file = files[i];
                    console.log(`  #${i + 1}: name="${path.basename(file)}" filePath="${file}"`);
                    await octokit.repos.uploadReleaseAsset({
                        url: release.upload_url,
                        file: fs.createReadStream(file),
                        headers: {
                            'Content-Type': mime.lookup(file) || 'application/octet-stream',
                            'Content-Length': fs.statSync(file).size,
                        },
                        name: path.basename(file),
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
            console.log(`> getReleaseByTag: owner=${owner}, repo=${repo}, tag=${tag}`);
            const res = await octokit.repos.getReleaseByTag({
                owner: owner,
                repo: repo,
                tag: tag,
            });
            release = res.data;
        } catch (err) {
            console.error(err);
            return;
        }

        try {
            const release_id = release.id;
            console.log(`> listAssetsForRelease: release_id=${release_id}`);

            let assets = [];
            let page = 1;
            do {
                const res = await octokit.repos.listAssetsForRelease({ owner, repo, release_id, page });
                assets = assets.concat(res.data);
                page = next(res);
            } while (page)

            const deleteAssets = assets.filter(asset => {
                return patterns.some(pattern => minimatch(asset.name, pattern));
            });
            console.log(`  assets=${assets.length}, deleteAssets=${deleteAssets.length}`);

            if (deleteAssets.length > 0) {
                console.log('> deleteReleaseAsset:');
                for (let i = 0; i < deleteAssets.length; ++i) {
                    const asset = deleteAssets[i];
                    console.log(`  #${i + 1}:`, {
                        id: asset.id,
                        name: asset.name,
                        label: asset.label,
                        state: asset.state,
                        size: asset.size,
                        download_count: asset.download_count,
                        created_at: asset.created_at,
                        updated_at: asset.updated_at,
                    });
                    await octokit.repos.deleteReleaseAsset({ owner, repo, asset_id: asset.id });
                }
            }
        } catch (err) {
            console.error(err);
        }
    },
    'list': async () => {
        const releases = await octokit.repos.listReleases({
            owner: program.owner,
            repo: program.repo,
            page: 1,
        });
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
        const message = err.message.replace(/https?:[^\s]*/g, (match) => match.replace(/\?.*/, ''));
        console.log(message);
        process.exit(1);
    }
}

main()
