#!/usr/bin/env node
const path = require('path');
const {pick} = require('lodash');

const {
    commandChangelog,
    commandCheck,
    commandCommit,
    commandRelease,
    commandUpdateVersion,
} = require('./index');
// } = require(path.resolve(__dirname, './index'));


const argv = require('yargs')
    .usage('Usage: $0 <command> [options]')
    .demandCommand()
    .describe('verbose', 'Explain what is being done')
    .alias('V', 'verbose')
    .alias('v', 'version')
    .help('help').alias('h', 'help')
    .epilog('Copyright 2019 by Arswarog')
    .command(
        'release [newVersion]',
        'Update version, update changelog, add and commit changes',
        yargs => yargs
            .positional('newVersion', {
                describe: 'New version. Details in command update-version\'s help',
                type: 'string',
                default: 'auto',
            })
            .describe('all', 'Add all files in commit, not only package.json and CHANGELOG.md')
            .alias('a', 'all')
            .describe('push', 'Push to remote repository')
            .describe('no-tag', 'Do not set tag')
            .hide('tag')
            // .describe('no-fetch', 'Don\'t fetch from remote repository')
            .boolean('fetch')
            .hide('fetch')
            .default({
                fetch: true,
                all: false,
                push: false,
                tag: true,
            }),
        configureHandler(
            ['newVersion'],
            ['fetch', 'verbose'],
            commandRelease,
        ),
    )
    .command(
        'check',
        'Check commit history, calculate new version. Read only',
        yargs => yargs
            // .describe('no-fetch', 'Don\'t fetch from remote repository')
            .boolean('fetch')
            .hide('fetch')
            .default({fetch: true}),
        configureHandler(
            [],
            ['fetch', 'verbose'],
            commandCheck,
        ),
    )
    .command(
        ['update-version [newVersion]', 'ver'],
        'Calculate and update version in package.json',
        yargs => yargs
            .positional('newVersion', {
                describe: 'New version. Can be auto, major, minor, patch or strict version',
                type: 'string',
                default: 'auto',
            })
            // .describe('force', 'Ignore check semantic versioning')
            // .describe('print-only', 'Read only mode. Only show new version')
            .default({
                force: false,
                printOnly: false,
            })
            .alias('p', 'print-only')
            .example('$0 update-version')
            .example('$0 update-version major')
            .example('$0 update-version 2.5.18-rc.1'),
        configureHandler(
            ['newVersion'],
            ['force', 'ro'],
            commandUpdateVersion,
        ),
    )
    .command(
        'changelog',
        'Update CHANGELOG.md',
        yargs => yargs
            // .describe('print-only', 'Read only mode. Only show new changes')
            .default({
                printOnly: false,
            }),
        configureHandler(
            [],
            ['printOnly'],
            commandChangelog,
        ),
    )
    .command(
        'commit',
        'Commit updates and set tag',
        yargs => yargs
            // .describe('all', 'Add all files in commit, not only package.json and CHANGELOG.md')
            // .alias('a', 'all')
            // .describe('push', 'Push to remote repository')
            // .describe('no-tag', 'Do not set tag')
            .default({
                all: false,
                push: false,
                tag: true,
            }),
        configureHandler(
            [],
            ['all', 'push', 'tag'],
            commandCommit,
        ),
    )
    .argv;

function configureHandler(argumentList: string[], optionList: string[], handler: (...args: any[]) => void) {
    return rawArgs => {
        const args = argumentList.map(key => rawArgs[key]);
        const options = pick(rawArgs, argumentList.concat(['verbose']));
        let verbose = 0;
        if (options.verbose) {
            if (options.verbose === true)
                verbose = 1;
            else if (Array.isArray(options.verbose))
                verbose = options.verbose.length;
        }
        options.verbose = verbose;
        handler(...args, options);
    };
}
