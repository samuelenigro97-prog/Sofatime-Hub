const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileAtomicSync, secureTokenEquals } = require('../index.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sofatime-hub-'));
const target = path.join(dir, 'state.json');
writeFileAtomicSync(target, '{"ok":true}', { mode: 0o600 });
assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"ok":true}');
assert.strictEqual(fs.readdirSync(dir).filter(f => f.includes('.tmp')).length, 0);
assert.strictEqual(secureTokenEquals('segreto-lungo', 'segreto-lungo'), true);
assert.strictEqual(secureTokenEquals('segreto-lungo', 'segreto-errato'), false);
assert.strictEqual(secureTokenEquals('', ''), false);
fs.rmSync(dir, { recursive: true, force: true });
console.log('Sicurezza: scrittura atomica e confronto token verificati.');
