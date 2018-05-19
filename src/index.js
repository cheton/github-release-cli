/* eslint no-console: 0 */
/* eslint max-len: 0 */
import path from 'path';
import GitHubApi from 'github';
import program from 'commander';
import minimatch from 'minimatch';
import pkg from '../package.json';

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .option('-T, --token <token>', 'OAuth2 token')
    .option('-o, --owner <owner>', 'owner')
    .option('-r, --repo <repo>', 'repo')
    .option('-t, --tag <tag>', 'tag')
    .option('-n, --name <name>', 'name')
    .option('-b, --body <body>', 'body', false)
    .option('-d, --draft', 'draft')
    .option('-p, --prerelease', 'prerelease');

program.parse(process.argv);

const [command, ...args] = program.args;

const github = new GitHubApi({
    version: '3.0.0',
    timeout: 5000,
    headers: {
        'user-agent': 'GitHub-Release-App'
    }
});

github.authenticate({
    type: 'oauth',
    token: program.token || process.env.GITHUB_TOKEN
});

const getReleaseByTag = (options) => {
    return new Promise((resolve, reject) => {
        github.repos.getReleases(options, (err, res) => {
            if (err) {
                reject(err);
                return;
            }
            const releases = res.filter(r => r.tag_name === options.tag || r.name === options.tag);
            releases.length ? resolve(releases[0]) : reject('Cannot find release');
        });
    });
};

const createRelease = (options) => {
    return new Promise((resolve, reject) => {
        github.repos.createRelease(options, (err, res) => {
            err ? reject(err) : resolve(res);
        });
    });
};

const editRelease = (options) => {
    return new Promise((resolve, reject) => {
        github.repos.editRelease(options, (err, res) => {
            err ? reject(err) : resolve(res);
        });
    });
};

const getAssets = (options) => {
    return new Promise((resolve, reject) => {
        github.repos.getAssets(options, (err, res) => {
            err ? reject(err) : resolve(res);
        });
    });
};

const deleteAsset = (options) => {
    return new Promise((resolve, reject) => {
        github.repos.deleteAsset(options, (err, res) => {
            err ? reject(err) : resolve(res);
        });
    });
};

const uploadAsset = (options) => {
    return new Promise((resolve, reject) => {
        github.repos.uploadAsset(options, (err, res) => {
            err ? reject(err) : resolve(res);
        });
    });
};

const fn = {
    'upload': async () => {
        const { owner, repo, tag, name, body, draft, prerelease } = program;
        const files = args;
        let release;

        try {
            console.log('> releases#getReleaseByTag');
            release = await getReleaseByTag({
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
                release = await createRelease({
                    owner: owner,
                    repo: repo,
                    tag_name: tag,
                    name: name || tag,
                    body: body || '',
                    draft: draft || false,
                    prerelease: prerelease || false
                });
            } else if (body && (release.body !== body)) {
                console.log('> releases#editRelease');
                let releaseOptions = {
                    owner: owner,
                    repo: repo,
                    id: release.id,
                    tag_name: tag,
                    name: name || tag,
                    body: body || '',
                    draft: draft == null ? release.draft : draft,
                    prerelease: prerelease == null ? release.prerelease : prerelease
                };
                release = await editRelease(releaseOptions);
            }

            if (files.length > 0) {
                console.log('> releases#uploadAsset');
                for (let i = 0; i < files.length; ++i) {
                    const file = files[i];
                    console.log('#%d name="%s" filePath="%s"', i + 1, path.basename(file), file);
                    await uploadAsset({
                        owner: owner,
                        repo: repo,
                        id: release.id,
                        filePath: file,
                        name: path.basename(file)
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
            release = await getReleaseByTag({
                owner: owner,
                repo: repo,
                tag: tag
            });
        } catch (err) {
            console.error(err);
            return;
        }

        try {
            console.log('> releases#getAssets');
            const assets = await getAssets({
                owner: owner,
                repo: repo,
                id: release.id
            });
            const deleteAssets = assets.filter(asset => {
                return patterns.some(pattern => minimatch(asset.name, pattern));
            });
            console.log('assets=%d, deleteAssets=%d', assets.length, deleteAssets.length);

            if (deleteAssets.length > 0) {
                console.log('> releases#deleteAsset');
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
                    await deleteAsset({
                        owner: owner,
                        repo: repo,
                        id: asset.id
                    });
                }
            }
        } catch (err) {
            console.error(err);
        }
    }
}[command];

typeof fn === 'function' && fn();
