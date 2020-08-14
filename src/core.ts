import { ReleaseType, inc as incrementVersion } from 'semver';

var conventionalChangelogPresetLoader = require('conventional-changelog-preset-loader');

var fs = require('fs');
var tempfile = require('tempfile');
var resolve = require('path').resolve;

const {Readable, Writable, Transform} = require('stream');
const addStream = require('add-stream');
const gitRawCommits = require('git-raw-commits');
const conventionalCommitsParser = require('conventional-commits-parser');
import { readFileSync, writeFileSync } from 'fs';
import * as ConventionalChangelogWriter from 'conventional-changelog-writer';

const execa = require('execa');

const _ = require('lodash');
const stream = require('stream');
const through = require('through2');
const shell = require('shelljs');

import { mergeConfig } from './merge-config';

export interface ICommit {
    type: string;
    scope: string;
    subject: string;
    merge: null,
    header: string;
    body: string;
    footer: string
    notes: { title: string, text: string }[];
    references: any[],
    mentions: any[],
    revert: null,
    hash: string;
    gitTags: string;
    committerDate: string;
}

class LogWriter extends Writable {
    _write(chunk, encoding, callback) {
        // console.log(`*******\n${chunk.toString()}`);

        callback();
    }
}

export async function setVersionTag(version: string) {
    if (shell.exec('git rev-parse --verify HEAD', {silent: true}).code === 0) {
        const tag = 'v' + version;

        const headHash = await getGitHead();
        const tags = await getTags('HEAD');
        if (tags.includes(tag)) {
            console.log('Tag already exists');
            throw new Error(`Tag "${tag}" already exists`);
        }

        setTag(tag);
    }
}

export async function addToGit(files: string[], execaOptions?) {
    await execa('git', ['add', ...files], execaOptions);
}

export async function commit(message: string, execaOptions?) {
    await execa('git', ['commit', '-m', message], execaOptions);
}

export async function setTag(tagName, execaOptions?) {
    await execa('git', ['tag', tagName], execaOptions);
}

async function getTags(branch?: string, execaOptions?) {
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

export async function getGitHead(execaOptions?) {
    return (await execa('git', ['rev-parse', 'HEAD'], execaOptions)).stdout;
}

export async function getTagHash(tag: string, execaOptions?) {
    return (await execa('git', ['rev-parse', tag], execaOptions)).stdout;
}

export async function getTagHead(tagName, execaOptions?) {
    return (await execa('git', ['rev-list', '-1', tagName], execaOptions)).stdout;
}

export function changelogByCommitArray(context: ConventionalChangelogWriter.Context, commits: ICommit[]): Promise<string> {
    const options: ConventionalChangelogWriter.Options = {};

    let changelog = '';

    class CounterWriter extends Writable {
        constructor(private resolve) {super();}

        _write(chunk, encoding, callback) {
            // console.log(`*******\n${chunk.toString()}`);

            this.resolve(chunk.toString());
            // changelog = chunk.toString();

            callback();
        }
    }

    return new Promise(((resolve, reject) => {
        Readable.from(commits)
                .pipe(ConventionalChangelogWriter(context, options))
                .pipe(new CounterWriter(resolve));
    }));
}

class CommitMySteam extends Readable {
    constructor(commits: ICommit) {
        super({highWaterMark: 2});

        this._max = 1000;
        this._index = 0;
    }

    _read() {
        this._index += 1;

        if (this._index > this._max) {
            this.push(null);
        } else {
            const buf = Buffer.from(`${this._index}`, 'utf8');

            this.push(buf);
        }
    }
}

export function commitsAsArray(options, context, gitRawCommitsOpts, parserOpts, writerOpts, gitRawExecOpts?): Promise<{ commits: ICommit[], context: any }> {
    return new Promise(((resolve, reject) => {
        writerOpts = writerOpts || {};

        const commits: ICommit[] = [];

        var readable = new stream.Readable({
            objectMode: writerOpts.includeDetails,
        });
        readable._read = function () { };

        var commitsStream = new stream.Readable({
            objectMode: true,
        });
        commitsStream._read = function () { };

        var commitsErrorThrown = false;

        function commitsRange(from, to) {
            return gitRawCommits(_.merge({}, gitRawCommitsOpts, {
                from: from,
                to: to,
            }))
                .on('error', function (err) {
                    if (!commitsErrorThrown) {
                        setImmediate(commitsStream.emit.bind(commitsStream), 'error', err);
                        commitsErrorThrown = true;
                    }
                });
        }

        mergeConfig(options, context, gitRawCommitsOpts, parserOpts, writerOpts, gitRawExecOpts)
            .then(function (data) {
                options = data.options;
                context = data.context;
                gitRawCommitsOpts = data.gitRawCommitsOpts;
                parserOpts = data.parserOpts;
                writerOpts = data.writerOpts;
                gitRawExecOpts = data.gitRawExecOpts;

                if (shell.exec('git rev-parse --verify HEAD', {silent: true}).code === 0) {
                    var reverseTags = context.gitSemverTags.slice(0).reverse();
                    reverseTags.push('HEAD');

                    if (gitRawCommitsOpts.from) {
                        if (reverseTags.indexOf(gitRawCommitsOpts.from) !== -1) {
                            reverseTags = reverseTags.slice(reverseTags.indexOf(gitRawCommitsOpts.from));
                        } else {
                            reverseTags = [gitRawCommitsOpts.from, 'HEAD'];
                        }
                    }

                    var streams = reverseTags.map((to, i) => {
                        const from = i > 0
                            ? reverseTags[i - 1]
                            : '';
                        return commitsRange(from, to);
                    });

                    if (gitRawCommitsOpts.from) {
                        streams = streams.splice(1);
                    }

                    if (gitRawCommitsOpts.reverse) {
                        streams.reverse();
                    }

                    streams.reduce((prev, next) => next.pipe(addStream(prev)))
                           .on('data', function (data) {
                               setImmediate(commitsStream.emit.bind(commitsStream), 'data', data);
                           })
                           .on('end', function () {
                               setImmediate(commitsStream.emit.bind(commitsStream), 'end');
                           });
                } else {
                    commitsStream = gitRawCommits(gitRawCommitsOpts, gitRawExecOpts);
                }

                commitsStream
                    .on('error', function (err) {
                        err.message = 'Error in git-raw-commits: ' + err.message;
                        setImmediate(readable.emit.bind(readable), 'error', err);
                    })
                    .pipe(conventionalCommitsParser(parserOpts))
                    .on('error', function (err) {
                        err.message = 'Error in conventional-commits-parser: ' + err.message;
                        setImmediate(readable.emit.bind(readable), 'error', err);
                    })
                    // it would be better if `gitRawCommits` could spit out better formatted data
                    // so we don't need to transform here
                    .pipe(through.obj(function (chunk, enc, cb) {
                        try {
                            commits.push(chunk);
                            options.transform.call(this, chunk, cb);
                        } catch (err) {
                            cb(err);
                        }
                    }))
                    .on('error', function (err) {
                        err.message = 'Error in options.transform: ' + err.message;
                        setImmediate(readable.emit.bind(readable), 'error', err);
                    })
                    .on('finish', () => {
                        commits.reverse();
                        resolve({commits, context});
                    });
            });


        // .on('error', function (err) {
        //     console.error(err.stack);
        //     process.exit(1);
        // })
        // .on('end', function (err) {
        //     console.log('end');
        //     resolve(array);
        // })
        // .on('data', (data) => {
        //     console.log(data.toString());
        // });

        // console.log('start');
        // stream.pipe(new LogWriter());
    }));
}

export function conventionalChangelogCore(options, context, gitRawCommitsOpts, parserOpts, writerOpts, gitRawExecOpts?) {
    writerOpts = writerOpts || {};

    var readable = new stream.Readable({
        objectMode: writerOpts.includeDetails,
    });
    readable._read = function () { };

    var commitsErrorThrown = false;

    var commitsStream = new stream.Readable({
        objectMode: true,
    });
    commitsStream._read = function () { };

    function commitsRange(from, to) {
        return gitRawCommits(_.merge({}, gitRawCommitsOpts, {
            from: from,
            to: to,
        }))
            .on('error', function (err) {
                if (!commitsErrorThrown) {
                    setImmediate(commitsStream.emit.bind(commitsStream), 'error', err);
                    commitsErrorThrown = true;
                }
            });
    }

    mergeConfig(options, context, gitRawCommitsOpts, parserOpts, writerOpts, gitRawExecOpts)
        .then(function (data) {
            options = data.options;
            context = data.context;
            gitRawCommitsOpts = data.gitRawCommitsOpts;
            parserOpts = data.parserOpts;
            writerOpts = data.writerOpts;
            gitRawExecOpts = data.gitRawExecOpts;

            if (shell.exec('git rev-parse --verify HEAD', {silent: true}).code === 0) {
                var reverseTags = context.gitSemverTags.slice(0).reverse();
                reverseTags.push('HEAD');

                if (gitRawCommitsOpts.from) {
                    if (reverseTags.indexOf(gitRawCommitsOpts.from) !== -1) {
                        reverseTags = reverseTags.slice(reverseTags.indexOf(gitRawCommitsOpts.from));
                    } else {
                        reverseTags = [gitRawCommitsOpts.from, 'HEAD'];
                    }
                }

                var streams = reverseTags.map((to, i) => {
                    const from = i > 0
                        ? reverseTags[i - 1]
                        : '';
                    return commitsRange(from, to);
                });

                if (gitRawCommitsOpts.from) {
                    streams = streams.splice(1);
                }

                if (gitRawCommitsOpts.reverse) {
                    streams.reverse();
                }

                streams.reduce((prev, next) => next.pipe(addStream(prev)))
                       .on('data', function (data) {
                           setImmediate(commitsStream.emit.bind(commitsStream), 'data', data);
                       })
                       .on('end', function () {
                           setImmediate(commitsStream.emit.bind(commitsStream), 'end');
                       });
            } else {
                commitsStream = gitRawCommits(gitRawCommitsOpts, gitRawExecOpts);
            }

            commitsStream
                .on('error', function (err) {
                    err.message = 'Error in git-raw-commits: ' + err.message;
                    setImmediate(readable.emit.bind(readable), 'error', err);
                })
                .pipe(conventionalCommitsParser(parserOpts))
                .on('error', function (err) {
                    err.message = 'Error in conventional-commits-parser: ' + err.message;
                    setImmediate(readable.emit.bind(readable), 'error', err);
                })
                // it would be better if `gitRawCommits` could spit out better formatted data
                // so we don't need to transform here
                .pipe(through.obj(function (chunk, enc, cb) {
                    try {
                        options.transform.call(this, chunk, cb);
                    } catch (err) {
                        cb(err);
                    }
                }))
                .on('error', function (err) {
                    err.message = 'Error in options.transform: ' + err.message;
                    setImmediate(readable.emit.bind(readable), 'error', err);
                })
                .pipe(ConventionalChangelogWriter(context, writerOpts))
                .on('error', function (err) {
                    err.message = 'Error in conventional-changelog-writer: ' + err.message;
                    setImmediate(readable.emit.bind(readable), 'error', err);
                })
                .pipe(through({
                    objectMode: writerOpts.includeDetails,
                }, function (chunk, enc, cb) {
                    try {
                        readable.push(chunk);
                    } catch (err) {
                        setImmediate(function () {
                            throw err;
                        });
                    }

                    cb();
                }, function (cb) {
                    readable.push(null);

                    cb();
                }));
        })
        .catch(function (err) {
            setImmediate(readable.emit.bind(readable), 'error', err);
        });

    return readable;
}

// last index


// const semverRelease = new SemverRelease();
//
// semverRelease.fetch(options, templateContext, gitRawCommitsOpts, config.parserOpts, config.writerOpts)
//              .then(async () => {
//                  // console.log(semverRelease.context);
//                  console.log('---');
//                  console.log('current version ', semverRelease.version);
//                  console.log('nextVersion', semverRelease.nextVersion);
//                  // console.log('changelog:\n', semverRelease.additionalChangelog);
// //                  await semverRelease.updateVersion();
// //                  await semverRelease.updateChangelog();
// //                  await semverRelease.commit();
//              });


export class SemverRelease {
    context: ConventionalChangelogWriter.Context;
    commits: ICommit[];
    commitStat: {
        breakingChanges: number;
        features: number;
        fixes: number;
    };

    version: string;
    newVersion: string;
    additionalChangelog: string;

    constructor() {
    }

    async fetch() {

        var config;
        var flags: any = {
            infile: undefined,
            outfile: undefined,
            sameFile: undefined,
            preset: undefined,
            pkg: undefined,
            append: undefined,
            'release-count': undefined,
            'skip-unstable': undefined,
            outputUnreleased: undefined,
            verbose: undefined,
            config: undefined,
            context: undefined,
            lernaPackage: undefined,
            tagPrefix: undefined,
        };
        var infile = flags.infile;
        var outfile = flags.outfile;
        var sameFile = flags.sameFile;
        var append = flags.append;
        var releaseCount = flags.releaseCount;
        var skipUnstable = flags.skipUnstable;

        if (infile && infile === outfile) {
            sameFile = true;
        } else if (sameFile) {
            if (infile) {
                outfile = infile;
            } else {
                console.error('infile must be provided if same-file flag presents.');
                process.exit(1);
            }
        }

        var options = _.omitBy({
            preset: flags.preset,
            pkg: {
                path: flags.pkg,
            },
            append: append,
            releaseCount: releaseCount,
            skipUnstable: skipUnstable,
            outputUnreleased: flags.outputUnreleased,
            lernaPackage: flags.lernaPackage,
            tagPrefix: flags.tagPrefix,
        }, _.isUndefined);

        if (flags.verbose) {
            options.debug = console.info.bind(console);
            options.warn = console.warn.bind(console);
        }

        var templateContext;

        var outStream;

        try {
            if (flags.context) {
                templateContext = require(resolve(process.cwd(), flags.context));
            }

            if (flags.config) {
                config = require(resolve(process.cwd(), flags.config));
                options.config = config;
                options = _.merge(options, config.options);
            } else {
                config = {};
            }
        } catch (err) {
            console.error('Failed to get file. ' + err);
            process.exit(1);
        }

        var gitRawCommitsOpts = _.merge({}, config.gitRawCommitsOpts || {});
        if (flags.commitPath) gitRawCommitsOpts.path = flags.commitPath;

        var changelogStream = conventionalChangelog(options, templateContext, gitRawCommitsOpts, config.parserOpts, config.writerOpts);
//     .on('error', function (err) {
//         if (flags.verbose) {
//             console.error(err.stack);
//         } else {
//             console.error(err.toString());
//         }
//         process.exit(1);
//     });

        function noInputFile() {
            changelogStream.pipe(new LogWriter())
            // if (outfile) {
            //     outStream = fs.createWriteStream(outfile);
            // } else {
            //     outStream = process.stdout;
            // }
            //
            // changelogStream
            //     .pipe(outStream);
        }

        if (infile && releaseCount !== 0) {
            var readStream = fs.createReadStream(infile)
                               .on('error', function () {
                                   if (flags.verbose) {
                                       console.warn('infile does not exist.');
                                   }

                                   if (sameFile) {
                                       noInputFile();
                                   }
                               });

            if (sameFile) {
                if (options.append) {
                    changelogStream
                        .pipe(fs.createWriteStream(outfile, {
                            flags: 'a',
                        }));
                } else {
                    var tmp = tempfile();

                    changelogStream
                        .pipe(addStream(readStream))
                        .pipe(fs.createWriteStream(tmp))
                        .on('finish', function () {
                            fs.createReadStream(tmp)
                              .pipe(fs.createWriteStream(outfile));
                        });
                }
            } else {
                if (outfile) {
                    outStream = fs.createWriteStream(outfile);
                } else {
                    outStream = process.stdout;
                }

                var streamLocal;

                if (options.append) {
                    streamLocal = readStream
                        .pipe(addStream(changelogStream));
                } else {
                    streamLocal = changelogStream
                        .pipe(addStream(readStream));
                }

                streamLocal
                    .pipe(outStream);
            }
        } else {
            noInputFile();
        }

        function conventionalChangelog(options, context, gitRawCommitsOpts, parserOpts, writerOpts) {
            options.warn = options.warn || function () {};

            if (options.preset) {
                try {
                    options.config = conventionalChangelogPresetLoader(options.preset);
                } catch (err) {
                    if (typeof options.preset === 'object') {
                        options.warn(`Preset: "${options.preset.name}" ${err.message}`);
                    } else if (typeof options.preset === 'string') {
                        options.warn(`Preset: "${options.preset}" ${err.message}`);
                    } else {
                        options.warn(`Preset: ${err.message}`);
                    }
                }
            }

            return conventionalChangelogCore(options, context, gitRawCommitsOpts, parserOpts, writerOpts);
        }


        return this.fetchPrivate(options, templateContext, gitRawCommitsOpts, config.parserOpts, config.writerOpts);
    }

    async fetchPrivate(options, initialContext, gitRawCommitsOpts, parserOpts, writerOpts, gitRawExecOpts?) {
        const {commits, context} = await commitsAsArray(options, initialContext, gitRawCommitsOpts, parserOpts, writerOpts, gitRawExecOpts);
        this.commits = commits;
        this.context = context;
        this.version = context.packageData.version;
        this.newVersion = await this.calculateNextVersion();
        this.additionalChangelog = await this.getAdditionalChangelog();
    }

    private calculateNextVersion(): string {
        let breakingChanges = 0;
        let features = 0;
        let fixes = 0;

        this.commits.forEach(commit => {
            // console.log('commit', commit);
            if (commit.type === 'fix') fixes++;
            if (commit.type === 'feat') features++;
            if (commit.notes.some(note => note.title.toUpperCase() === 'BREAKING CHANGE'))
                breakingChanges++;
        });

        let nextVersion = this.version;
        if (breakingChanges)
            nextVersion = incrementVersion(this.version, 'major');
        else if (features)
            nextVersion = incrementVersion(this.version, 'minor');
        else if (fixes)
            nextVersion = incrementVersion(this.version, 'patch');

        this.commitStat = {
            breakingChanges,
            features,
            fixes,
        };

        return nextVersion;
    }

    private getAdditionalChangelog(): Promise<string> {
        const nextContext = {
            ...this.context,
            version: this.newVersion,
        };

        return changelogByCommitArray(nextContext, this.commits);
    }

    async updateVersion() {
        const content = readFileSync('./package.json').toString();
        const json = JSON.parse(content);
        if (json.version === this.newVersion)
            return console.log('Version already updated');
        json.version = this.newVersion;
        writeFileSync('./package.json', JSON.stringify(json, null, 2));
    }

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

    async commit() {
        await addToGit(['package.json', 'CHANGELOG.md']);

        const versionTag = 'v' + this.newVersion;

        const headHash = await getGitHead();
        const tags = await getTags('HEAD');

        if (tags.includes(versionTag)) {
            const tagHash = await getTagHash(versionTag);
            if (tagHash === headHash)
                return console.log('Tag already created and already on head');
            else
                throw new Error(`Tag already exists but not on head. Can not update`);
        }

        await commit(`chore(release): ${this.newVersion}`);
        await setVersionTag(this.newVersion);
    }
}

