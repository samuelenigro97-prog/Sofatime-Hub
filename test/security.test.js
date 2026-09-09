// Test di sicurezza senza dipendenze esterne: eseguibile con `npm test`.
// Verifica cifratura token a riposo, retrocompatibilità in chiaro e scrittura atomica.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Env fittizie: index.js richiede SIMKL_CLIENT_ID all'import.
process.env.SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID || 'test-id';
process.env.SIMKL_CLIENT_SECRET = process.env.SIMKL_CLIENT_SECRET || 'test-secret';
process.env.TOKEN_ENC_KEY = 'chiave-di-test-per-cifratura';

const { serializeToken, deserializeToken, writeFileAtomicSync, requestToken, tokenMatches, ENC_PREFIX } = require('../index.js');

let passed = 0;
const ok = (name) => { console.log('  ok -', name); passed++; };

const sample = { access_token: 'AAA', refresh_token: 'BBB', created_at: 1000, expires_in: 7776000 };

// 1) Con TOKEN_ENC_KEY impostata i token vengono cifrati...
const enc = serializeToken(sample);
assert.ok(enc.startsWith(ENC_PREFIX), 'il token serializzato deve essere cifrato');
assert.ok(!enc.includes('AAA') && !enc.includes('BBB'), 'il testo in chiaro non deve comparire');
ok('serializeToken cifra quando la chiave è presente');

// 2) ...e si decifrano identici (round-trip).
assert.deepStrictEqual(deserializeToken(enc), sample, 'round-trip cifratura fallito');
ok('deserializeToken ripristina il token cifrato');

// 3) Retrocompatibilità: un token in chiaro (vecchio formato) viene ancora letto.
const plain = JSON.stringify(sample);
assert.deepStrictEqual(deserializeToken(plain), sample, 'lettura formato in chiaro fallita');
ok('deserializeToken legge il vecchio formato in chiaro');

// 4) Manomissione rilevata: un byte alterato fa fallire la decifratura (AES-GCM autenticato).
const tampered = enc.slice(0, -2) + (enc.slice(-2) === 'AA' ? 'BB' : 'AA');
assert.throws(() => deserializeToken(tampered), 'la manomissione deve essere rilevata');
ok('deserializeToken rifiuta un token manomesso');

// 5) Scrittura atomica: il file finale esiste e nessun .tmp resta orfano.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trakthub-'));
const target = path.join(dir, 'token.json');
writeFileAtomicSync(target, enc, { mode: 0o600 });
assert.ok(fs.existsSync(target), 'il file finale deve esistere');
assert.strictEqual(fs.readdirSync(dir).filter(f => f.includes('.tmp')).length, 0, 'nessun file .tmp orfano');
assert.deepStrictEqual(deserializeToken(fs.readFileSync(target, 'utf8')), sample, 'contenuto scritto non valido');
ok('writeFileAtomicSync scrive in modo atomico');
fs.rmSync(dir, { recursive: true, force: true });

const bearerReq = { get: name => name === 'authorization' ? 'Bearer segreto-lungo' : '', query: {} };
assert.strictEqual(requestToken(bearerReq), 'segreto-lungo');
assert.strictEqual(tokenMatches(bearerReq, 'segreto-lungo'), true);
assert.strictEqual(tokenMatches(bearerReq, 'segreto-errato'), false);
assert.strictEqual(tokenMatches({ get: () => '', query: { token: 'legacy' } }, 'legacy'), false, 'i token in query non sono accettati');
assert.strictEqual(tokenMatches({ get: () => '', query: {} }, ''), false, 'segreto assente deve fallire chiuso');
ok('solo autorizzazione Bearer e comportamento fail-closed');

console.log('\nTutti i test superati (' + passed + ').');
