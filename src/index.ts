#!/usr/bin/env node
'use strict';

import {
    addToGit,
    commit,
    conventionalChangelogCore,
    getGitHead, getTagHash,
    getTagHead,
    SemverRelease,
    setVersionTag,
} from './core';


const semverRelease = new SemverRelease();

export async function commandPipeline(newVersion: string, {verbose, fetch}: {
    fetch: boolean,
    verbose: number
}) {
    console.log('processPipeline', newVersion);

    await commandCheck({verbose} as any);
    await commandUpdateVersion(newVersion, {verbose} as any);
    await commandChangelog({verbose} as any);
    await commandCommit({verbose} as any);
}

export async function commandCheck(options: { fetch: boolean, verbose: number }) {
    if (!semverRelease.version)
        await semverRelease.fetch();
    console.log(`Current version: ${semverRelease.version}`);
    console.log(`New version: ${semverRelease.newVersion}`);
    console.log(`Diff: ${semverRelease.commits.length} commits`);
    console.log(`  Fixes: ${semverRelease.commitStat.fixes}`);
    console.log(`  Features: ${semverRelease.commitStat.features}`);
    console.log(`  BreakingChanges: ${semverRelease.commitStat.breakingChanges}`);
}

export async function commandUpdateVersion(newVersion: string, {force, printOnly, verbose}: { force: boolean, printOnly: boolean, verbose: number }) {
    if (!semverRelease.version)
        await semverRelease.fetch();
    if (newVersion && newVersion !== 'auto')
        semverRelease.newVersion = newVersion;

    if (printOnly)
        return console.log(semverRelease.version);

    if (verbose)
        console.log(`Update version in package.json: from ${semverRelease.version} to ${semverRelease.newVersion}`);

    await semverRelease.updateVersion();

    if (verbose)
        console.log(`Done`);
}

export async function commandChangelog({verbose, printOnly}: { printOnly: boolean, verbose: number }) {
    if (!semverRelease.version)
        await semverRelease.fetch();
    const log = printLog(verbose);
    const changelog = semverRelease.additionalChangelog;
    if (printOnly)
        return console.log('Additional changelog:\n' + changelog);

    log(2, 'Writing changelog');
    semverRelease.updateChangelog();
    log(2, 'Done');
}

export async function commandCommit({verbose}: { push: boolean, tag: boolean, verbose: number }) {
    const log = printLog(verbose);

    if (!semverRelease.version)
        await semverRelease.fetch();
    console.log(semverRelease.newVersion);
    await semverRelease.commit();
}

function printLog(verbose: number) {
    return (level: number, message: string) => {
        if (verbose >= level)
            console.log(`LOG: ${message}`);
    };
}
