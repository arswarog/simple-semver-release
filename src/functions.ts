import { Readable } from 'stream';
import { merge } from 'lodash';
import * as ConventionalChangelogWriter from 'conventional-changelog-writer';
import { gitGetCommitsRange, gitGetSemverTag } from './git';
import { ICommit } from './types';

// if unknown service (not github, gitlab, bitbucket)

(async () => {
    const tags = await gitGetSemverTag();
    console.log(tags);
    tags.reverse();
    tags.unshift('');
    tags.push('HEAD');

    const all = [];
    for (let i = 1; i < tags.length; i++) {
        const from = tags[i - 1];
        const to = tags[i];
        console.log('from, to', from, to);
        const commits = await gitGetCommitsRange(from, to);
        commits.reverse();
        console.log(commits.map(commit => commit.hash + ' ' + commit.gitTags));
        console.log('count:', commits.length);
        all.push(...commits);
    }

    const changelog = await changelogByCommits(all);
    console.log('changelog:');
    console.log(changelog);
})();

export function changelogByCommits(commits: ICommit[], options?: ConventionalChangelogWriter.Options): Promise<string> {
    options = merge({}, options);
    return new Promise((resolve, reject) => {
        let text = '';
        let stream = Readable.from(commits.map(item => JSON.stringify(item)))
                             .pipe(ConventionalChangelogWriter({}, {}))
                             .on('data', chunk => text += chunk.toString())
                             .on('error', reject)
                             .on('end', () => resolve(text));
    });
}
