#!/usr/bin/env node
const {pick} = require('lodash');

var argv = require('yargs')
    .usage('Usage: $0 <command> [options]')
    .demandCommand()
    .describe('verbose', 'Explain what is being done')
    .alias('v', 'verbose')
    .help('help').alias('h', 'help')
    .epilog('Copyright 2019 by Arswarog')
    .command(
        '$0 [newVersion]',
        'Update version, update changelog, add and commit changes',
        yargs => yargs
            .positional('newVersion', {
                describe: 'New version. Details in command update-version\'s help',
                type: 'string',
                default: 'auto'
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
                tag: true
            }),
        configureHandler(['fetch', 'verbose'], args => {
            console.log('Do pipeline', args);
        })
    )
    .command(
        'check',
        'Check commit history, calculate new version. Read only',
        yargs => yargs
            // .describe('no-fetch', 'Don\'t fetch from remote repository')
            .boolean('fetch')
            .hide('fetch')
            .default({fetch: true}),
        configureHandler(['fetch', 'verbose'], args => {
            console.log('Check', args);
        })
    )
    .command(
        ['update-version [newVersion]', 'ver'],
        'Calculate and update version in package.json',
        yargs => yargs
            .positional('newVersion', {
                describe: 'New version. Can be auto, major, minor, patch or strict version',
                type: 'string',
                default: 'auto'
            })
            .describe('force', 'Ignore check semantic versioning')
            .describe('ro', 'Read only mode. Only show new version')
            .default({
                force: false,
                ro: false,
            })
            .example('$0 update-version')
            .example('$0 update-version major')
            .example('$0 update-version 2.5.18-rc.1'),
        configureHandler(['newVersion', 'force', 'ro'], args => {
            console.log('Update to version', args);
        }),
    )
    .command(
        'changelog',
        'Update CHANGELOG.md',
        yargs => yargs
            .describe('ro', 'Read only mode. Only show new changes')
            .default({
                ro: false
            }),
        configureHandler(['ro'], args => {
            console.log('Write changelog', args);
        }),
    )
    .command(
        'commit',
        'Commit updates and set tag',
        yargs => yargs
            .describe('all', 'Add all files in commit, not only package.json and CHANGELOG.md')
            .alias('a', 'all')
            .describe('push', 'Push to remote repository')
            .describe('no-tag', 'Do not set tag')
            .default({
                all: false,
                push: false,
                tag: true,
            }),
        configureHandler(['all', 'push', 'tag'], args => {
            console.log('Commit', args);
        }),
    )
    .argv;

function configureHandler(argumentList, handler) {
    return rawArgs => {
        const args = pick(rawArgs, argumentList.concat(['verbose']));
        let verbose = 0;
        if (args.verbose) {
            if (args.verbose === true)
                verbose = 1;
            else if (Array.isArray(args.verbose))
                verbose = args.verbose.length;
        }
        args.verbose = verbose;
        handler(args);
    };
}
