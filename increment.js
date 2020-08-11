var conventionalCommitsParser = require('conventional-commits-parser');
var gitRawCommits = require('git-raw-commits');
const {Readable, Writable, Transform} = require('stream');

class CounterReader extends Readable {
    constructor(opt) {
        super(opt);

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

class CounterWriter extends Writable {
    _write(chunk, encoding, callback) {
        console.log(`*******\n${chunk.toString()}`);

        callback();
    }
}

class CounterTransform extends Transform {
    _transform(chunk, encoding, callback) {
        try {
            // console.log(chunk);
            const text = chunk.toString();
            console.log(text);
            const data = conventionalCommitsParser.sync(text, {});
            console.log(data);
            // callback(null, conventionalCommitsParser.sync(chunk, {}));
            callback(null, text);
            // const resultString = `*${chunk.toString('utf8')}*`;
            //
            // callback(null, resultString);
        } catch (err) {
            callback(err);
        }
    }
}

const counterReader = new CounterReader({highWaterMark: 2});
const counterWriter = new CounterWriter({highWaterMark: 2});
const counterTransform = new CounterTransform({highWaterMark: 2});

// counterReader.pipe(counterTransform).pipe(counterWriter);

//
// class CounterTransform extends Transform {
//     _transform(chunk, encoding, callback) {
//         try {
//
//             console.log(chunk);
//             callback(chunk);
//             // const resultString = `*${chunk.toString('utf8')}*`;
//             //
//             // callback(null, resultString);
//         } catch (err) {
//             callback(err);
//         }
//     }
// }
//
gitRawCommits({})
    // .pipe(conventionalCommitsParser({}))
    .pipe(counterTransform)
    .pipe(counterWriter);
//
//
// console.log(conventionalCommitsParser.sync('fix(title): a title is fixed\n\nfix 1234, feat 6789 ', {}));
