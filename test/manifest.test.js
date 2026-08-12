// Test su manifest e logica cataloghi: eseguibile con `npm test`, senza dipendenze esterne.
// Verifica versione allineata a package.json, risorse, nomi/id dei cataloghi e conversione ID.
const assert = require('assert');

const { manifest, idsFromStremioId, stremioIdFromIds } = require('../index.js');
const pkg = require('../package.json');

console.log('Esecuzione test manifest / cataloghi...');

let passed = 0;
const ok = (name) => { console.log('  ok -', name); passed++; };

// 1) La versione del manifest deve combaciare con package.json.
//    Regressione: in passato manifest.version era rimasto fermo mentre package.json cambiava,
//    così Stremio non rilevava mai gli aggiornamenti.
assert.strictEqual(manifest.version, pkg.version, 'manifest.version deve combaciare con package.json');
ok('manifest.version allineato a package.json');

// 2) L'addon espone solo i cataloghi: il tracking passa dalle API dedicate.
assert.deepStrictEqual(manifest.resources, ['catalog'], "le risorse devono essere solo ['catalog']");
ok("resources contiene solo 'catalog'");

// 3) Tipi supportati.
assert.deepStrictEqual(manifest.types, ['movie', 'series'], "i tipi devono essere ['movie','series']");
ok('types corretti');

// 4) Quattro cataloghi con id e nomi attesi (allineati all'app Sofa Time originale).
assert.strictEqual(manifest.catalogs.length, 4, 'devono esserci 4 cataloghi');
const byId = Object.fromEntries(manifest.catalogs.map(c => [c.id, c]));
assert.strictEqual(byId['sofatime-movies'].name, 'Da guardare');
assert.strictEqual(byId['sofatime-movies'].type, 'movie');
assert.strictEqual(byId['sofatime-series'].name, 'Da guardare');
assert.strictEqual(byId['sofatime-series'].type, 'series');
assert.strictEqual(byId['sofatime-movies-random'].name, 'Cosa guardare?');
assert.strictEqual(byId['sofatime-movies-random'].type, 'movie');
assert.strictEqual(byId['sofatime-series-random'].name, 'Cosa guardare?');
assert.strictEqual(byId['sofatime-series-random'].type, 'series');
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

// 7) Conversione ID Stremio -> ID generici.
assert.deepStrictEqual(idsFromStremioId('tt1375666'), { imdb: 'tt1375666' });
assert.deepStrictEqual(idsFromStremioId('tmdb:27205'), { tmdb: 27205 });
assert.deepStrictEqual(idsFromStremioId('tt1234567:2:4'), { imdb: 'tt1234567' });
assert.deepStrictEqual(idsFromStremioId('altro'), {});
assert.deepStrictEqual(idsFromStremioId(undefined), {});
ok('idsFromStremioId converte imdb/tmdb');

// 8) Conversione ID generici -> Stremio (imdb ha priorità, poi tmdb, altrimenti null).
assert.strictEqual(stremioIdFromIds({ imdb: 'tt1375666', tmdb: 27205 }), 'tt1375666');
assert.strictEqual(stremioIdFromIds({ tmdb: 27205 }), 'tmdb:27205');
assert.strictEqual(stremioIdFromIds({}), null);
assert.strictEqual(stremioIdFromIds(null), null);
ok('stremioIdFromIds converte con priorità imdb');

console.log('\nTutti i test manifest superati (' + passed + ').');
