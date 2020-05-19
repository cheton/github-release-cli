/* eslint no-console: 0 */
/* eslint max-len: 0 */
import fs from 'fs';
import path from 'path';
import Octokit from '@octokit/rest';
import chalk from 'chalk';
import program from 'commander';
import * as LinkHeader from 'http-link-header';
import * as mime from 'mime-types';
import minimatch from 'minimatch';
import parse from 'url-parse';
import ora from 'ora';
import pkg from '../package.json';

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .option('--baseurl <baseurl>', 'API endpoint', 'https://api.github.com')
    .option('-T, --token <token>', 'OAuth2 token', null)
    .option('-o, --owner <owner>', 'The repository owner.', '')
    .option('-r, --repo <repo>', 'The repository name.', '')
    .option('-t, --tag <tag>', 'The name of the tag.')
    .option('--release-id <id>', 'The release id.')
    .option('-c, --commitish <value>', 'Specifies the commitish value for tag. Unused if the tag already exists.')
    .option('-n, --name <name>', 'The name of the release.', '') // Note: name is a reserved word and it has to specify a default value.
    .option('-b, --body <body>', 'Text describing the contents of the tag.')
    .option('-d, --draft [value]', '`true` makes the release a draft, and `false` publishes the release.', function(val) {
        if (String(val).toLowerCase() === 'false') {
            return false;
        }
        return true;
    })
    .option('-p, --prerelease [value]', '`true` to identify the release as a prerelease, `false` to identify the release as a full release.', function(val) {
        if (String(val).toLowerCase() === 'false') {
            return false;
        }
        return true;
    });

program.parse(process.argv);

const [command, ...args] = program.args;

const token = (program.token || process.env.GITHUB_TOKEN);
const octokit = new Octokit({
    auth: token || null,
    baseUrl: program.baseurl,
});
    
const getNextPage = (response) => {
    if (!response.headers || !response.headers.link) {
        return false;
    }

    const link = LinkHeader.parse(response.headers.link).rel('next');
    if (!link || !link[0]) {
        return false;
    }

    const url = parse(link[0].uri, null, true);
    if (!url.query) {
        return false;
    }

    const nextPage = parseInt(url.query.page);
    return nextPage;
};

const getReleaseByTag = async ({ owner, repo, tag }) => {
    try {
        const res = await octokit.repos.getReleaseByTag({ owner, repo, tag });
        const release = res.data;
        return release;
    } catch (e) {
        // Ignore
    }

    try {
        let page = 1;
        do {
            const res = await octokit.repos.listReleases({ owner, repo, page });
            const releases = res.data;
            for (const release of releases) {
                if (release.tag_name === tag) {
                    return release;
                }
            }
            page = getNextPage(res);
        } while (page)
    } catch (err) {
        // Ignore
    }

    console.log('No release found.');
    return null;
};

const parseBody = (str) => {
    try {
        return JSON.parse(str);
    } catch (err) {
        return str;
    }
}
    
const fn = {
    'upload': async () => {
        const { owner, repo, tag, commitish, name, body, draft, prerelease, releaseId } = program;
        const files = args;
        let release;

        try {
            if (tag) {
                console.log(`> getReleaseByTag: owner=${owner}, repo=${repo}, tag=${tag}`);
                release = await getReleaseByTag({ owner, repo, tag });
            } else if (releaseId) {
                console.log(`> getRelease: owner=${owner}, repo=${repo}, release_id=${releaseId}`);
                const res = await octokit.repos.getRelease({ owner, repo, release_id: releaseId });
                release = res.data;
            }
        } catch (err) {
            // Ignore
        }

        try {
            if (!release) {
                console.log(`> createRelease: tag_name=${tag}, target_commitish=${commitish || ''}, name=${name || tag}, draft=${!!draft}, prerelease=${!!prerelease}`);
                const res = await octokit.repos.createRelease({
                    owner,
                    repo,
                    tag_name: tag,
                    target_commitish: commitish,
                    name: name || tag,
                    body: parseBody(body) || '',
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
                    body: (body === undefined) ? release.body || '' : parseBody(body) || '',
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
        const { owner, repo, tag, releaseId } = program;
        const patterns = args;
        let release;

        try {
            if (tag) {
                console.log(`> getReleaseByTag: owner=${owner}, repo=${repo}, tag=${tag}`);
                release = await getReleaseByTag({ owner, repo, tag });
            } else if (releaseId) {
                console.log(`> getRelease: owner=${owner}, repo=${repo}, release_id=${releaseId}`);
                const res = await octokit.repos.getRelease({ owner, repo, release_id: releaseId });
                release = res.data;
            }

            if (!release) {
                return;
            }

            if (patterns.length === 0) {
                const release_id = release.id;
                console.log(`> deleteRelease: release_id=${release_id}`);
                await octokit.repos.deleteRelease({ owner, repo, release_id: release.id });
                return;
            }
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
                page = getNextPage(res);
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
        const { owner, repo } = program;
        let releases = [];

        const spinner = ora({
            spinner: 'point',
            text: 'Fetching...',
        }).start();

        try {
            let page = 1;
            do {
                const res = await octokit.repos.listReleases({ owner, repo, page });
                releases = releases.concat(res.data);
                page = getNextPage(res);
            } while (page)
        } catch (err) {
            console.error(err);
        }

        spinner.stop();

        for (const release of releases) {
            let prefix = 'RELEASE';
            if (release.draft) {
                prefix = 'DRAFT';
            }
            if (release.prerelease) {
                prefix = 'PRERELEASE';
            }
            console.log(`${chalk.blue('●')} [${prefix}] id=${chalk.cyan(release.id)}, tag_name=${chalk.yellow(JSON.stringify(release.tag_name))}, name=${chalk.yellow(JSON.stringify(release.name))}, created_at=${chalk.yellow(release.created_at)}, published_at=${chalk.yellow(release.published_at)}`);
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
