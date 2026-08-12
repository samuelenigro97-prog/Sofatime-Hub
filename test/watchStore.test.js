const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { upsertEvent, listState } = require('../watchStore');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sofatime-state-'));
const file = path.join(dir, 'watch.json');
const first = upsertEvent(file, {
  action: 'pause', progress: 42, movie: { title: 'Inception', ids: { imdb: 'tt1375666' } }
}, 'nuvio');
assert.strictEqual(first.key, 'tt1375666');
assert.strictEqual(first.watched, false);

const second = upsertEvent(file, {
  action: 'watched', progress: 100, movie: { title: 'Inception', ids: { imdb: 'tt1375666' } }
}, 'stremio');
assert.strictEqual(second.watched, true);
assert.strictEqual(listState(file).length, 1, 'upsert non deve duplicare il titolo');
assert.strictEqual(listState(file)[0].source, 'stremio');
assert.throws(() => upsertEvent(file, { action: 'pause', progress: 101, movie: { ids: { imdb: 'tt1' } } }));
assert.throws(() => upsertEvent(file, { action: 'pause', progress: 10, movie: {} }));
fs.rmSync(dir, { recursive: true, force: true });
console.log('Watch store: merge, validazione e persistenza verificati.');
