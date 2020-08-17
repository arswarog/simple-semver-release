import * as ConventionalChangelogWriter from 'conventional-changelog-writer';
import { dirname } from 'path';
import {
    addToGit,
    changelogByCommitArray,
    commitsAsArray,
    getGitHead,
    getTagHash,
    setVersionTag,
} from './core';
import {
    inc as incrementVersion,
    valid as semverValid,
    gt as semverGt,
} from 'semver';
import { readFileSync, writeFileSync } from 'fs';
import { gitGetCommitsRange, gitCommit, gitGetSemverTag, gitGetTags } from './git';
import semver = require('semver/preload');
import { ICommit } from './types';
import * as readPkgUp from 'read-pkg-up';
import { commandChangelog, commandCheck, commandCommit, commandUpdateVersion } from './index';
import { changelogByCommits } from './functions';
import { merge } from 'lodash';
import { Readable } from 'stream';
import conventionalChangelogWriter = require('conventional-changelog-writer');

export interface ISemverReleaseOptions {
    verbose: number;
}

export interface IStats {
    breakingChanges: number;
    features: number;
    fixes: number;
    other: number;
    chores: number;
}

export class SemverRelease {
    packageJson: readPkgUp.NormalizedPackageJson;
    projectRoot: string;
    releases: string[];
    options: ISemverReleaseOptions;
    commits: ICommit[];
    commitStat: IStats;
    version: string;
    newVersion: string;
    recommendedNewVersion: string;
    currentChangelog: string;
    additionalChangelog: string;
    alreadyReleased: boolean;

    private fresh = false;
    private refreshing = false;
    private context: ConventionalChangelogWriter.Context;

    constructor(options: Partial<ISemverReleaseOptions> = {}) {
        this.options = Object.assign<ISemverReleaseOptions, Partial<ISemverReleaseOptions>>(
            {
                verbose: 0,
            },
            options,
        );
    }

    public log(level: number, message: string) {
        if (this.options.verbose >= level)
            console.log(`[LOG] ${message}`);
    }

    public async runReleasePipeline(options: {}) {
        await this.refresh();
        if (this.alreadyReleased)
            return console.log('Already release');

        this.log(1, `Releasing ${this.newVersion}`);
        await this.updatePkgVersion();
        await this.generateAdditionalChangelog();
        await this.updateAdditionalChangelog();
        await this.commit();
    }

    public async setVersion(newVersion: string = 'auto') {
        await this.refresh();
        this.log(1, `Set version "${newVersion}"`);

        let newVersionNum = '';
        switch (newVersion) {
            case 'auto':
                newVersionNum = this.recommendedNewVersion;
                break;
            case 'patch':
            case 'minor':
            case 'major':
                newVersionNum = incrementVersion(this.version, newVersion);
                break;
            default:
                if (!semverValid(newVersion))
                    throw new Error(`Invalid version "${newVersion}"`);
                if (!semverGt(newVersion, this.version))
                    throw new Error(`New version "${newVersion}" must be greater then current version "${this.version}"`);
                newVersionNum = newVersion;
        }

        this.log(2, ` Current version ${this.version}`);
        this.log(2, ` New version     ${newVersionNum}`);
        this.newVersion = newVersionNum;
        return this.version !== this.newVersion;
    }

    public async updatePkgVersion() {
        this.log(1, 'Update version in package.json');

        const content = readFileSync('./package.json').toString();
        const json = JSON.parse(content);
        json.version = this.newVersion;
        writeFileSync('./package.json', JSON.stringify(json, null, 2));
    }

    private async generateAdditionalChangelog(): Promise<string> {
        this.log(1, 'Generate additional changelog...');
        this.additionalChangelog = await this.changelogByCommits(this.commits);
        this.log(1, `Generate additional changelog complete (${this.additionalChangelog.trim().split('\n').length} lines)`);
        return this.additionalChangelog;
    }

    private async updateAdditionalChangelog(): Promise<void> {
        this.log(1, 'Update additional changelog...');
        const trimmedCurrent = this.currentChangelog.trim();
        const trimmedAdditional = this.additionalChangelog.trim();
        if (trimmedCurrent.substr(0, trimmedAdditional.length) === trimmedAdditional)
            return this.log(1, 'Changelog already updated');
        const changelog = this.additionalChangelog + this.currentChangelog;
        writeFileSync('./CHANGELOG.md', changelog);
        this.log(1, `Update additional changelog complete (${changelog.trim().split('\n').length} lines)`);
    }

    /**
     * RAW
     */
    async updateChangelog() {
        const additional = this.additionalChangelog;
        const content = readFileSync('./CHANGELOG.md').toString();
        if (content.substr(0, additional.length) === additional)
            return console.log('Changelog already updated');

        writeFileSync('./CHANGELOG.md', [
            additional,
            content,
        ].join('\n'));
    }

    /**
     * RAW
     */
    async commit() {
        this.log(1, 'Commit changes');
        this.log(2, ' Add files to git index');
        await addToGit(['package.json', 'CHANGELOG.md']);

        this.log(2, ' Check tag');
        const versionTag = 'v' + this.newVersion;

        const headHash = await getGitHead();
        const tags = await gitGetTags('HEAD');

        if (tags.includes(versionTag)) {
            const tagHash = await getTagHash(versionTag);
            if (tagHash === headHash)
                return console.log('Tag already created and already on head');
            else
                throw new Error(`Tag already exists but not on head. Can not update`);
        }

        this.log(2, ' Commit changes');
        await gitCommit(`chore(release): ${this.newVersion}`);
        this.log(2, ' Set tag');
        await setVersionTag(this.newVersion);
    }

    private analizeCommits() {
        let stats: IStats = {
            breakingChanges: 0,
            features: 0,
            fixes: 0,
            chores: 0,
            other: 0,
        };

        let lastStats = stats;
        this.commits.forEach(commit => {
            if (commit.type === 'chore') stats = {
                ...stats,
                chores: stats.chores + 1,
            };
            if (commit.type === 'fix') stats = {
                ...stats,
                fixes: stats.fixes + 1,
            };
            if (commit.type === 'feat') stats = {
                ...stats,
                features: stats.features + 1,
            };
            if (commit.notes.some(note => note.title.toUpperCase() === 'BREAKING CHANGE')) stats = {
                ...stats,
                breakingChanges: stats.breakingChanges + 1,
            };
            if (stats === lastStats)
                stats = stats = {
                    ...stats,
                    other: stats.other + 1,
                };
            lastStats = stats;
        });

        let nextVersion = this.version;
        if (stats.breakingChanges)
            nextVersion = incrementVersion(this.version, 'major');
        else if (stats.features)
            nextVersion = incrementVersion(this.version, 'minor');
        else if (stats.fixes)
            nextVersion = incrementVersion(this.version, 'patch');

        this.commitStat = stats;
        this.recommendedNewVersion = nextVersion;

        return nextVersion;
    }

    public async refresh(force = false) {
        this.log(1, 'Refresh data...');
        if (!force && this.fresh)
            return this.log(1, ' Skipped, already fresh.');

        if (this.refreshing)
            throw new Error(`Refreshing already started`);
        this.refreshing = true;

        const {packageJson, path} = await readPkgUp();
        this.packageJson = packageJson;
        this.projectRoot = dirname(path);
        if (process.cwd() !== this.projectRoot)
            throw new Error(`Sorry, I can run only on project root, but started on ${process.cwd()}`);

        this.version = this.packageJson.version;

        this.releases = await gitGetSemverTag();
        this.releases.sort((a, b) => {
            if (a === b) return 0;
            return semver.lt(a, b) ? 1 : -1;
        });
        this.commits = await gitGetCommitsRange(this.releases.length ? this.releases[0] : '', 'HEAD');
        this.analizeCommits();
        this.newVersion = this.newVersion || this.recommendedNewVersion;

        this.alreadyReleased = !this.commits.length;

        this.log(2, ' Read current changelog');
        this.currentChangelog = readFileSync('./CHANGELOG.md').toString();

        this.log(1, ' Refreshing complete.');
        this.fresh = true;
        this.refreshing = false;
    }

    private changelogByCommits(commits: ICommit[], options?: ConventionalChangelogWriter.Options): Promise<string> {
        options = merge({}, options);
        const context: Partial<conventionalChangelogWriter.Context> = {
            version: this.newVersion,
        };
        return new Promise((resolve, reject) => {
            let text = '';
            let stream = Readable.from(commits.map(item => JSON.stringify(item)))
                                 .pipe(ConventionalChangelogWriter(context, options))
                                 .on('data', chunk => text += chunk.toString())
                                 .on('error', reject)
                                 .on('end', () => resolve(text));
        });
    }
}
