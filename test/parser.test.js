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

// 6) REGRESSIONE: il backup che noi stessi salviamo su Gist/disco viene riletto
//    periodicamente (poller ogni 30 min) attraverso QUESTA STESSA funzione. A quel
//    punto addedDate non è più una stringa ISO ma il timestamp numerico che avevamo
//    già calcolato al primo giro. Se il "secondo giro" collassasse tutto a 0,
//    l'ordinamento di "Da guardare" smetterebbe di funzionare in silenzio (bug
//    reale riscontrato in produzione: Date.parse(number) è sempre NaN).
const firstPass = parseSofaTimeData({
  movies: [{ title: 'Film', imdb_id: 'tt0000004', addedDate: '2026-09-20T10:00:00Z' }]
});
const roundTripped = JSON.parse(JSON.stringify(firstPass)); // simula il salvataggio+rilettura da Gist/disco
const secondPass = parseSofaTimeData({ movies: roundTripped.movies });
assert.strictEqual(secondPass.movies[0].addedDate, firstPass.movies[0].addedDate,
  'il timestamp deve sopravvivere identico a un secondo giro di parsing (round-trip Gist/disco)');
assert.notStrictEqual(secondPass.movies[0].addedDate, 0, 'non deve collassare a 0 al secondo giro');
ok('parseSofaTimeData preserva addedDate anche quando arriva già come timestamp numerico');

console.log(`\nTutti i test parser superati (${passed}).`);
