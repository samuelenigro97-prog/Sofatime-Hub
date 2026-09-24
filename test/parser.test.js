const assert = require('assert');
const { parseSofaTimeData, extractIds } = require('../sofatimeParser.js');

console.log('Esecuzione test parser Sofa Time...');

let passed = 0;
const ok = (name) => { console.log('  ok -', name); passed++; };

// 1) Test estrazione ID
const ids = extractIds({ imdb_id: 'tt1234567', tmdb_id: '999' });
assert.strictEqual(ids.imdb, 'tt1234567');
assert.strictEqual(ids.tmdb, 999);
ok('extractIds estrae imdb e tmdb correttamente');

// 2) Test parsing JSON backup formato Sofa Time / generic watchlist
const sampleJson = {
  watchlist: [
    { movie: { title: 'Inception', year: 2010, ids: { imdb: 'tt1375666', tmdb: 27205 } } },
    { show: { name: 'Breaking Bad', year: 2008, ids: { imdb: 'tt0903747' } } }
  ]
};

const parsed = parseSofaTimeData(sampleJson);
assert.strictEqual(parsed.movies.length, 1);
assert.strictEqual(parsed.movies[0].title, 'Inception');
assert.strictEqual(parsed.movies[0].ids.imdb, 'tt1375666');

assert.strictEqual(parsed.shows.length, 1);
assert.strictEqual(parsed.shows[0].title, 'Breaking Bad');
assert.strictEqual(parsed.shows[0].ids.imdb, 'tt0903747');
ok('parseSofaTimeData separa correttamente film e serie tv');

// 3) Test con stringa JSON grezza
const rawStr = JSON.stringify({
  movies: [{ title: 'Interstellar', year: 2014, imdb_id: 'tt0816692' }]
});
const parsedStr = parseSofaTimeData(rawStr);
assert.strictEqual(parsedStr.movies.length, 1);
assert.strictEqual(parsedStr.movies[0].title, 'Interstellar');
ok('parseSofaTimeData analizza stringhe JSON grezze');

// 4) addedDate viene catturato e convertito in timestamp: serve a ordinare
//    "Da guardare" dal più recente, perché l'ordine nel file di export di
//    Sofa Time non corrisponde all'ordine di aggiunta alla watchlist.
const withDates = parseSofaTimeData({
  movies: [
    { title: 'Vecchio', imdb_id: 'tt0000001', addedDate: '2026-08-01T10:00:00Z' },
    { title: 'Nuovo', imdb_id: 'tt0000002', addedDate: '2026-09-20T10:00:00Z' }
  ]
});
assert.ok(withDates.movies[0].addedDate > 0, 'addedDate deve essere un timestamp numerico');
assert.ok(withDates.movies[1].addedDate > withDates.movies[0].addedDate, 'il più recente deve avere timestamp maggiore');
ok('parseSofaTimeData cattura addedDate come timestamp confrontabile');

// 5) Un elemento senza addedDate non deve far fallire il parsing.
const withoutDate = parseSofaTimeData({ movies: [{ title: 'Senza data', imdb_id: 'tt0000003' }] });
assert.strictEqual(withoutDate.movies[0].addedDate, 0);
ok('parseSofaTimeData gestisce elementi senza addedDate (default 0)');

// 6) parseSofaTimeData espone sempre `watched` (vuoto se assente): usato dal
//    catalogo "Visti di recente".
assert.deepStrictEqual(parsedStr.watched, { movies: [], shows: [] }, 'watched vuoto se il file non lo contiene');
ok('parseSofaTimeData espone watched vuoto quando non presente');

// 7) Se root.watched è già nel formato "arricchito" (round-trip del nostro
//    stesso upload/Gist), viene passato attraverso invariato.
const withWatched = parseSofaTimeData({
  movies: [{ title: 'Da vedere', imdb_id: 'tt0000004' }],
  watched: { movies: [{ title: 'Già visto', ids: { imdb: 'tt0000005' } }], shows: [] }
});
assert.strictEqual(withWatched.watched.movies.length, 1);
assert.strictEqual(withWatched.watched.movies[0].title, 'Già visto');
assert.strictEqual(withWatched.watched.shows.length, 0);
ok('parseSofaTimeData passa attraverso root.watched quando presente');

console.log(`\nTutti i test parser superati (${passed}).`);
