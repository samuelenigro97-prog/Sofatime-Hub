// Test su enrich(): verifica che un tmdbId risolto ma senza scheda pubblicata
// (TMDB risponde 404 su /movie|tv/{id}, es. titoli annunciati da pochissimo
// come Cyberpunk: Edgerunners 2) venga classificato "in arrivo" invece di
// sparire silenziosamente tra i titoli già usciti. Mocka global.fetch: nessuna
// chiamata di rete reale.
const assert = require('assert');

process.env.SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID || 'test-id';
process.env.SIMKL_CLIENT_SECRET = process.env.SIMKL_CLIENT_SECRET || 'test-secret';
process.env.TMDB_KEY = process.env.TMDB_KEY || 'test-tmdb-key';

const realFetch = global.fetch;
global.fetch = async () => ({ ok: false, status: 404 });

const { enrich } = require('../index.js');

global.fetch = realFetch;

console.log('Esecuzione test enrich()...');
let passed = 0;
const ok = (name) => { console.log('  ok -', name); passed++; };

(async () => {
  global.fetch = async () => ({ ok: false, status: 404 });
  const result = await enrich({ tmdb: 326788 }, 'series');
  global.fetch = realFetch;

  assert.ok(result, 'un tmdbId risolto ma senza scheda pubblicata non deve restituire null');
  assert.strictEqual(result.upcoming, true, 'senza dati TMDB va trattato come "in arrivo", non come già uscito');
  assert.strictEqual(result.releaseDate, null, 'senza scheda pubblicata non c\'è una data di uscita nota');
  assert.strictEqual(result.tmdbId, '326788');
  ok('enrich classifica "in arrivo" un tmdbId che risponde 404');

  console.log(`\nTutti i test enrich superati (${passed}).`);
})();
