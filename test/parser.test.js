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

console.log(`\nTutti i test parser superati (${passed}).`);
