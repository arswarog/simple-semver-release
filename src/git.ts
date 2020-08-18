import * as execa from 'execa';
import * as gitSemverTags from 'git-semver-tags';
import * as ConventionalCommitsParser from 'conventional-commits-parser';
import * as gitRawCommits from 'git-raw-commits';
import { ICommit } from './types';
import * as shell from 'shelljs';

const format = '%B%n-hash-%n%H%n-gitTags-%n%d%n-committerDate-%n%ci';

export async function gitCommit(message: string, execaOptions?) {
    await execa('git', ['commit', '-m', message], execaOptions);
}

export async function getTagHash(tag: string, execaOptions?) {
    return (await execa('git', ['rev-parse', tag], execaOptions)).stdout;
}

export async function gitGetTags(branch?: string, execaOptions?) {
    return (await execa(
        'git',
        branch
            ? ['tag', '--merged', branch]
            : ['tag'],
        execaOptions,
    )).stdout
      .split('\n')
      .map((tag) => tag.trim())
      .filter(Boolean);
}

export async function gitGetSemverTag(): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) =>
        gitSemverTags({
            lernaTags: false,
            package: undefined,
            tagPrefix: 'v',
            // skipUnstable: false,
        }, function (err, result) {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        }))
        .then(tags => {
            // TODO sorting
            return tags;
        });
}


export function gitGetCommitsRange(from, to): Promise<ICommit[]> {
    const commitParserInit = (options: ConventionalCommitsParser.Options) => (commitText: string) => {
        return ConventionalCommitsParser.sync(commitText, options);
    };

    const commitParser = commitParserInit({});

    return new Promise((resolve, reject) => {
        const commits = [];
        gitRawCommits({
            format,
            from: from,
            to: to,
        })
            .on('error', function (err) {
                console.error(err);
            })
            .on('data', function (data) {
                // console.log('--- data ---');
                // console.log(data.toString());
                const commit = commitParser(data.toString());
                // console.log(commit);
                // console.log('--- data end ---');
                commits.push(commit);
            })
            .on('end', function (data) {
                // console.log('end', data);
                resolve(commits);
            })
            .on('finish', function (data) {
                console.log('finish', data);
            });
    });
}

export async function gitSetTag(tagName, execaOptions?) {
    await execa('git', ['tag', tagName], execaOptions);
}

export async function gitSetVersionTag(version: string) {
    if (shell.exec('git rev-parse --verify HEAD', {silent: true}).code === 0) {
        const tag = 'v' + version;

        const tags = await gitGetTags('HEAD');
        if (tags.includes(tag)) {
            console.log('Tag already exists');
            throw new Error(`Tag "${tag}" already exists`);
        }

        await gitSetTag(tag);
    }
}

export async function gitAddToIndex(files: string[], execaOptions?) {
    await execa('git', ['add', ...files], execaOptions);
}
