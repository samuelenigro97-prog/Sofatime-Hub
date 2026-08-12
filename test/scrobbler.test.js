const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadKnownWatched, saveKnownWatched } = require('../scrobbler');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sofatime-scrobbler-'));
const stateFile = path.join(dir, 'watched.json');

assert.deepStrictEqual([...loadKnownWatched(stateFile)], []);

const watched = new Set(['tt1375666', 'tt0903747']);
saveKnownWatched(stateFile, watched);
assert.deepStrictEqual([...loadKnownWatched(stateFile)].sort(), [...watched].sort());
assert.strictEqual(fs.readdirSync(dir).some(name => name.includes('.tmp-')), false);

fs.rmSync(dir, { recursive: true, force: true });
console.log('Scrobbler: persistenza e scrittura atomica verificate.');
