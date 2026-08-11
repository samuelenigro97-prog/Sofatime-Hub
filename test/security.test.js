const assert = require('assert');
const { tokenMatches } = require('../index.js');

assert.strictEqual(tokenMatches('segreto-lungo', 'segreto-lungo'), true);
assert.strictEqual(tokenMatches('sbagliato', 'segreto-lungo'), false);
assert.strictEqual(tokenMatches('', 'segreto-lungo'), false);
assert.strictEqual(tokenMatches('segreto-lungo', ''), false);

console.log('✓ confronto costante dei token amministrativi');
