const fs = require('fs');
const path = require('path');

/**
 * Parser per file di backup / export di Sofa Time (.json / .sofa3bk).
 *
 * Tipi di struttura gestiti:
 * 1. Formato backup Sofa Time (.json / .sofa3bk) contenente elenchi di film e serie tv
 * 2. Formato esportazione generico con liste 'watchlist', 'movies', 'shows', 'history'
 */

function extractIds(item) {
  if (!item) return {};
  const ids = {};
  if (item.imdb_id || item.imdbId || item.imdb) {
    ids.imdb = String(item.imdb_id || item.imdbId || item.imdb);
    if (!ids.imdb.startsWith('tt') && /^\d+$/.test(ids.imdb)) {
      ids.imdb = 'tt' + ids.imdb.padStart(7, '0');
    }
  }
  if (item.tmdb_id || item.tmdbId || item.tmdb || item.id_tmdb) {
    ids.tmdb = parseInt(item.tmdb_id || item.tmdbId || item.tmdb || item.id_tmdb, 10);
  }
  return ids;
}

function parseSofaTimeData(data) {
  if (!data) return { movies: [], shows: [] };
  
  let jsonObj = data;
  if (typeof data === 'string') {
    try {
      jsonObj = JSON.parse(data);
    } catch (e) {
      console.warn('[sofatimeParser] Errore parsing JSON:', e.message);
      return { movies: [], shows: [] };
    }
  }

  const result = {
    movies: [],
    shows: []
  };

  // Se l'oggetto ha un campo radice 'data' o 'backup'
  const root = jsonObj.data || jsonObj.backup || jsonObj;

  // Analizza elementi in watchlist / to_watch / plantowatch
  const watchlistCandidates = [
    ...(root.watchlist || []),
    ...(root.to_watch || []),
    ...(root.plantowatch || []),
    ...(root.movies || []),
    ...(root.shows || []),
    ...(root.items || [])
  ];

  for (const item of watchlistCandidates) {
    const media = item.movie || item.show || item.media || item;
    const typeStr = (item.type || media.type || (item.movie ? 'movie' : (item.show ? 'show' : ''))).toLowerCase();
    
    const ids = extractIds(media.ids || media);
    const title = media.title || media.name || item.title || '';
    const year = parseInt(media.year || media.release_date || item.year || 0, 10) || undefined;
    
    // Filtra elementi non pertinenti o senza identificativi
    if (!title && !ids.imdb && !ids.tmdb) continue;

    const entry = { ids, title, year };

    if (typeStr.includes('movie') || item.movie) {
      result.movies.push(entry);
    } else if (typeStr.includes('show') || typeStr.includes('tv') || typeStr.includes('series') || item.show) {
      result.shows.push(entry);
    } else {
      // In assenza di tipo esplicito, inserisci sia tra film che tra serie se ha id
      result.movies.push(entry);
    }
  }

  return result;
}

async function loadSofaTimeBackup(filePathOrUrl) {
  if (!filePathOrUrl) return null;

  try {
    if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
      console.log('[sofatimeParser] Scaricamento backup da URL:', filePathOrUrl);
      const res = await fetch(filePathOrUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return parseSofaTimeData(text);
    } else {
      console.log('[sofatimeParser] Lettura backup da file:', filePathOrUrl);
      if (!fs.existsSync(filePathOrUrl)) {
        console.warn('[sofatimeParser] File non trovato:', filePathOrUrl);
        return null;
      }
      const text = fs.readFileSync(filePathOrUrl, 'utf8');
      return parseSofaTimeData(text);
    }
  } catch (e) {
    console.error('[sofatimeParser] Errore caricamento backup:', e.message);
    return null;
  }
}

module.exports = {
  parseSofaTimeData,
  loadSofaTimeBackup,
  extractIds
};
