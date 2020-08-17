import { printLog } from './log';
import { SemverRelease } from './semver-release';

export async function commandRelease(newVersion: string, options: {
    fetch: boolean,
    verbose: number
}) {
    console.log('processRelease', newVersion);

    const semverRelease = new SemverRelease(options);
    if (!await semverRelease.setVersion(newVersion)) {
        return console.log(`Nothing to do: already released`);
    }
    await semverRelease.runReleasePipeline(options);
}

export async function commandCheck({fetch, verbose}: { fetch: boolean, verbose: number }) {
    const semverRelease = new SemverRelease({verbose});

    await semverRelease.refresh(true);

    const log = printLog(verbose);
    log(1, 'Starting command "check"');
    log(2, 'Fetching complete');
    console.log(`Project root: ${semverRelease.projectRoot}`);
    console.log(`Current version: ${semverRelease.version}`);
    if (!semverRelease.newVersion || semverRelease.newVersion === semverRelease.recommendedNewVersion)
        console.log(`Next release: ${semverRelease.newVersion}`);
    else
        console.log(`Next release: ${semverRelease.newVersion} (recommended ${semverRelease.recommendedNewVersion})`);

    if (semverRelease.alreadyReleased)
        console.log('!!! Already released');

    if (semverRelease.releases.length)
        console.log(`Latest releases: ${semverRelease.releases.slice(0, 3).join(', ')}`);
    else
        console.log(`Releases: no releases`);
    if (semverRelease.commits) {
        console.log(`After last release: ${semverRelease.commits.length} commits`);
        console.log(`  Chore: ${semverRelease.commitStat.chores}`);
        console.log(`  Fixes: ${semverRelease.commitStat.fixes}`);
        console.log(`  Features: ${semverRelease.commitStat.features}`);
        console.log(`  BreakingChanges: ${semverRelease.commitStat.breakingChanges}`);
        console.log(`  Other: ${semverRelease.commitStat.other}`);
    } else
        console.log(`Diff: commits not loaded`);
}

export async function commandUpdateVersion(newVersion: string, {force, printOnly, verbose}: { force: boolean, printOnly: boolean, verbose: number }) {
    const semverRelease = new SemverRelease({verbose});

    if (newVersion && newVersion !== 'auto')
        semverRelease.newVersion = newVersion;

    if (printOnly)
        return console.log(semverRelease.version);

    if (verbose)
        console.log(`Update version in package.json: from ${semverRelease.version} to ${semverRelease.newVersion}`);

    if (!await semverRelease.setVersion(newVersion)) {
        return console.log(`Nothing to do: already released`);
    }
    await semverRelease.updatePkgVersion();

    if (verbose)
        console.log(`Done`);
}

export async function commandChangelog({verbose, printOnly}: { printOnly: boolean, verbose: number }) {
    const semverRelease = new SemverRelease({verbose});

    const log = printLog(verbose);
    const changelog = semverRelease.additionalChangelog;
    if (printOnly)
        return console.log('Additional changelog:\n' + changelog);

    log(2, 'Writing changelog');
    semverRelease.updateChangelog();
    log(2, 'Done');
}

export async function commandCommit({verbose}: { push: boolean, tag: boolean, verbose: number }) {
    const semverRelease = new SemverRelease({verbose});

    const log = printLog(verbose);

    console.log(semverRelease.newVersion);
    await semverRelease.commit();
}
