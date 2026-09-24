// Test su manifest e logica cataloghi: eseguibile con `npm test`, senza dipendenze esterne.
// Verifica versione allineata a package.json, risorse, nomi/id dei cataloghi e conversione ID.
const assert = require('assert');

// Env fittizie per coerenza con gli altri test (index.js le legge all'import).
process.env.SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID || 'test-id';
process.env.SIMKL_CLIENT_SECRET = process.env.SIMKL_CLIENT_SECRET || 'test-secret';

const { manifest, idsFromStremioId, stremioIdFromSimkl, isWatchlistFile, isWatchedFile } = require('../index.js');
const pkg = require('../package.json');

console.log('Esecuzione test manifest / cataloghi...');

let passed = 0;
const ok = (name) => { console.log('  ok -', name); passed++; };

// 1) La versione del manifest deve combaciare con package.json.
//    Regressione: in passato manifest.version era rimasto fermo mentre package.json cambiava,
//    così Stremio non rilevava mai gli aggiornamenti.
assert.strictEqual(manifest.version, pkg.version, 'manifest.version deve combaciare con package.json');
ok('manifest.version allineato a package.json');

// 2) L'addon espone solo i cataloghi (niente stream): evita di reintrodurre i tasti Simkl.
assert.deepStrictEqual(manifest.resources, ['catalog'], "le risorse devono essere solo ['catalog']");
ok("resources contiene solo 'catalog'");

// 3) Tipi supportati.
assert.deepStrictEqual(manifest.types, ['movie', 'series'], "i tipi devono essere ['movie','series']");
ok('types corretti');

// 4) Sei cataloghi con id e nomi attesi (allineati all'app Sofa Time originale).
assert.strictEqual(manifest.catalogs.length, 6, 'devono esserci 6 cataloghi');
const byId = Object.fromEntries(manifest.catalogs.map(c => [c.id, c]));
assert.strictEqual(byId['sofatime-movies'].name, 'Da guardare');
assert.strictEqual(byId['sofatime-movies'].type, 'movie');
assert.strictEqual(byId['sofatime-series'].name, 'Da guardare');
assert.strictEqual(byId['sofatime-series'].type, 'series');
assert.strictEqual(byId['sofatime-movies-random'].name, 'Cosa guardare?');
assert.strictEqual(byId['sofatime-movies-random'].type, 'movie');
assert.strictEqual(byId['sofatime-series-random'].name, 'Cosa guardare?');
assert.strictEqual(byId['sofatime-series-random'].type, 'series');
assert.strictEqual(byId['sofatime-movies-watched'].name, 'Visti di recente');
assert.strictEqual(byId['sofatime-movies-watched'].type, 'movie');
assert.strictEqual(byId['sofatime-series-watched'].name, 'Visti di recente');
assert.strictEqual(byId['sofatime-series-watched'].type, 'series');
ok('cataloghi con id/nomi/tipi corretti');

// 5) Ogni catalogo deve permettere skip (paginazione) e filtro per genere.
for (const c of manifest.catalogs) {
  const extraNames = (c.extra || []).map(e => e.name);
  assert.ok(extraNames.includes('skip'), `${c.id} deve supportare skip`);
  assert.ok(extraNames.includes('genre'), `${c.id} deve supportare genre`);
}
ok('tutti i cataloghi supportano skip e genre');

// 6) idPrefixes coerenti con gli id gestiti (IMDb e TMDB).
assert.ok(manifest.idPrefixes.includes('tt'), "idPrefixes deve includere 'tt'");
assert.ok(manifest.idPrefixes.includes('tmdb:'), "idPrefixes deve includere 'tmdb:'");
ok('idPrefixes corretti');

// 7) Conversione ID Stremio -> Simkl.
assert.deepStrictEqual(idsFromStremioId('tt1375666'), { imdb: 'tt1375666' });
assert.deepStrictEqual(idsFromStremioId('tmdb:27205'), { tmdb: 27205 });
assert.deepStrictEqual(idsFromStremioId('altro'), {});
ok('idsFromStremioId converte imdb/tmdb');

// 8) Conversione ID Simkl -> Stremio (imdb ha priorità, poi tmdb, altrimenti null).
assert.strictEqual(stremioIdFromSimkl({ imdb: 'tt1375666', tmdb: 27205 }), 'tt1375666');
assert.strictEqual(stremioIdFromSimkl({ tmdb: 27205 }), 'tmdb:27205');
assert.strictEqual(stremioIdFromSimkl({}), null);
assert.strictEqual(stremioIdFromSimkl(null), null);
ok('stremioIdFromSimkl converte con priorità imdb');

// 9) Selezione dei file del backup Sofa Time.
//    Regressione: un cambiamento che leggeva TUTTI i .json dello zip faceva
//    finire i titoli già visti (es. una serie finita) nel catalogo "Da guardare".
//    Gli elementi di watchlist* e watched* hanno campi identici: il nome del file
//    è l'unico modo per distinguerli.
assert.strictEqual(isWatchlistFile('watchlistMovie_(2026_09_21_13_28_20).json'), true);
assert.strictEqual(isWatchlistFile('watchlistShow_(2026_09_21_13_28_20).json'), true);
assert.strictEqual(isWatchlistFile('watchedMovie_(2026_09_21_13_28_20).json'), false, 'i film già visti vanno esclusi');
assert.strictEqual(isWatchlistFile('watchedShow_(2026_09_21_13_28_20).json'), false, 'le serie già viste vanno escluse');
assert.strictEqual(isWatchlistFile('stopWatchingMovie_(2026_09_21_13_28_20).json'), false);
assert.strictEqual(isWatchlistFile('stopWatchingShow_(2026_09_21_13_28_20).json'), false);
ok('isWatchlistFile esclude i file dei titoli visti/abbandonati');

// 10) Le liste personalizzate dell'utente restano incluse; i non-JSON no.
assert.strictEqual(isWatchlistFile('mcu__listid_1693983563_(2026_09_21_13_28_20).json'), true, 'le liste personalizzate vanno tenute');
assert.strictEqual(isWatchlistFile('readme.txt'), false);
assert.strictEqual(isWatchlistFile(''), false);
assert.strictEqual(isWatchlistFile(null), false);
ok('isWatchlistFile tiene le liste personalizzate e scarta i non-JSON');

// 11) isWatchedFile: complementare a isWatchlistFile per i titoli già visti
//     (catalogo "Visti di recente"). stopWatching* (abbandonati) resta escluso
//     da entrambe: non è né "da vedere" né "visto".
assert.strictEqual(isWatchedFile('watchedMovie_(2026_09_21_13_28_20).json'), true);
assert.strictEqual(isWatchedFile('watchedShow_(2026_09_21_13_28_20).json'), true);
assert.strictEqual(isWatchedFile('watchlistMovie_(2026_09_21_13_28_20).json'), false);
assert.strictEqual(isWatchedFile('stopWatchingMovie_(2026_09_21_13_28_20).json'), false, 'gli abbandonati non sono "visti"');
assert.strictEqual(isWatchedFile('mcu__listid_1693983563_(2026_09_21_13_28_20).json'), false);
assert.strictEqual(isWatchedFile(''), false);
assert.strictEqual(isWatchedFile(null), false);
ok('isWatchedFile individua solo i file dei titoli già visti');

console.log('\nTutti i test manifest superati (' + passed + ').');