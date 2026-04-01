import axios from 'axios';
import * as core from '@actions/core';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const exec = (cmd, args = [], options = {}) => new Promise((resolve, reject) =>
    spawn(cmd, args, { stdio: 'inherit', ...options })
        .on('close', code => {
            if (code !== 0) {
                return reject(Object.assign(
                    new Error(`Invalid exit code: ${code}`),
                    { code }
                ));
            };
            return resolve(code);
        })
        .on('error', reject)
);

const trimLeft = (value, charlist = '/') => value.replace(new RegExp(`^[${charlist}]*`), '');
const trimRight = (value, charlist = '/') => value.replace(new RegExp(`[${charlist}]*$`), '');
const trim = (value, charlist) => trimLeft(trimRight(value, charlist));

async function validateSubscription() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    let repoPrivate;

    if (eventPath && fs.existsSync(eventPath)) {
        const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
        repoPrivate = eventData?.repository?.private;
    }

    const upstream = 'ad-m/github-push-action';
    const action = process.env.GITHUB_ACTION_REPOSITORY;
    const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';

    core.info('');
    core.info('\u001B[1;36mStepSecurity Maintained Action\u001B[0m');
    core.info(`Secure drop-in replacement for ${upstream}`);
    if (repoPrivate === false) {
        core.info('\u001B[32m\u2713 Free for public repositories\u001B[0m');
    }
    core.info(`\u001B[36mLearn more:\u001B[0m ${docsUrl}`);
    core.info('');

    if (repoPrivate === false) return;

    const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
    const body = { action: action || '' };

    if (serverUrl !== 'https://github.com') {
        body.ghes_server = serverUrl;
    }

    try {
        const response = await axios.post(
            `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
            body,
            { timeout: 3000, validateStatus: () => true }
        );

        if (response.status === 403) {
            core.error(
                '\u001B[1;31mThis action requires a StepSecurity subscription for private repositories.\u001B[0m'
            );
            core.error(
                `\u001B[31mLearn how to enable a subscription: ${docsUrl}\u001B[0m`
            );
            process.exit(1);
        }
    } catch {
        core.info('Timeout or API not reachable. Continuing to next step.');
    }
}

const main = async () => {
    await validateSubscription()

    let branch = process.env.INPUT_BRANCH;
    const repository = trim(process.env.INPUT_REPOSITORY || process.env.GITHUB_REPOSITORY);
    const rawGithubUrl = trim(process.env.INPUT_GITHUB_URL);
    if (!rawGithubUrl.includes('//')) {
        throw new Error(`Invalid github_url: ${rawGithubUrl}. Expected a URL with protocol (e.g., https://github.com).`);
    }
    const github_url_protocol = rawGithubUrl.split('//')[0];
    const github_url = rawGithubUrl.split('//')[1];
    if (!branch) {
        const headers = {
            'User-Agent': 'github.com/step-security/ad-m-github-push-action'
        };
        if (process.env.INPUT_GITHUB_TOKEN) headers.Authorization = `token ${process.env.INPUT_GITHUB_TOKEN}`;
        const { data } = await axios.get(`${process.env.GITHUB_API_URL}/repos/${repository}`, { headers });
        branch = data.default_branch;
    }
    await exec('bash', [path.join(__dirname, './start.sh')], {
        env: {
            ...process.env,
            INPUT_BRANCH: branch,
            INPUT_REPOSITORY: repository,
            INPUT_GITHUB_URL_PROTOCOL: github_url_protocol,
            INPUT_GITHUB_URL: github_url,
        }
    });
};

main().catch(err => {
    console.error(err);
    process.exit(-1);
})
