const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadSofaTimeBackup } = require('./sofatimeParser');
const { startScrobblerLoop } = require('./scrobbler');
const { upsertEvent, listState } = require('./watchStore');

// ─── Config ───────────────────────────────────────────────────────────────────
const SOFATIME_BACKUP_PATH = process.env.SOFATIME_BACKUP_PATH || path.join(__dirname, 'sofatime_backup.json');
const SOFATIME_BACKUP_URL  = process.env.SOFATIME_BACKUP_URL  || '';

// API Keys
// Chiavi API gratuite/condivise: valori di default innocui, sovrascrivibili via env var.
const TMDB_KEY       = process.env.TMDB_KEY       || 'edf2b5b43d56fa6eea398145d50a1e98';
const RPDB_KEY       = process.env.RPDB_KEY       || 't0-free-rpdb-rounded-blocks';
// Credenziali personali dell'account Stremio per lo scrobbler: SOLO da env var, mai nel codice.
const STREMIO_EMAIL    = process.env.STREMIO_EMAIL    || '';
const STREMIO_PASSWORD = process.env.STREMIO_PASSWORD || '';
const UPLOAD_TOKEN     = process.env.UPLOAD_TOKEN     || '';
const SCROBBLE_TOKEN   = process.env.SCROBBLE_TOKEN   || '';

const PORT       = parseInt(process.env.PORT || '7780');
const RENDER_URL = 'https://sofa-time-hub.onrender.com';
const ADDON_URL  = (process.env.ADDON_URL || (process.env.RENDER ? RENDER_URL : 'http://localhost:' + PORT)).replace(/\/$/, '');
const WATCHED_STATE_FILE = path.join(__dirname, 'stremio_watched.json');
const HUB_STATE_FILE = process.env.HUB_STATE_FILE || path.join(__dirname, 'data', 'watch_state.json');
const CACHE_FILE = path.join(__dirname, 'cache_data.json');
const STREMIO_AUTHKEY = process.env.STREMIO_AUTHKEY || '';

const CACHE_TTL      = 60 * 1000;          // 1 min
const META_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 ore
const META_CACHE_VER = 2;
// Quanti minuti tra un fetch automatico del backup e il prossimo
// (es: 30 = rilegge ogni 30 min). 0 = disabilitato.
const BACKUP_REFRESH_MIN = parseInt(process.env.BACKUP_REFRESH_MIN || '30');

const MOVIE_GENRES  = ['Azione','Avventura','Animazione','Commedia','Crime','Documentario','Dramma','Fantasy','Horror','Mistero','Romantico','Fantascienza','Thriller','Guerra','Western'];
const SERIES_GENRES = ['Azione & Avventura','Animazione','Commedia','Crime','Documentario','Dramma','Fantascienza & Fantasy','Horror','Mistero','Reality','Thriller','Western'];

function writeFileAtomicSync(file, data, opts) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data, opts);
  fs.renameSync(tmp, file);
}
function secureTokenEquals(expected, supplied) {
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function idsFromStremioId(stremioId) {
  if (typeof stremioId !== 'string') return {};
  if (stremioId.startsWith('tt'))    return { imdb: stremioId.split(':')[0] };
  if (stremioId.startsWith('tmdb:')) return { tmdb: parseInt(stremioId.slice(5)) };
  return {};
}
function stremioIdFromIds(ids) {
  if (!ids) return null;
  if (ids.imdb) return ids.imdb;
  if (ids.tmdb) return 'tmdb:' + ids.tmdb;
  return null;
}

// Watchlist "plan to watch" dal backup Sofa Time.
async function getPlanToWatch(mediaType) {
  // 0. Usa la cache in memoria del backup (aggiornata dal poller automatico)
  if (cachedBackupData) {
    const items = mediaType === 'movies' ? cachedBackupData.movies : cachedBackupData.shows;
    if (items && items.length > 0) {
      return items.filter(x => stremioIdFromIds(x.ids));
    }
  }

  // 1. Scarica il backup da URL (prima esecuzione o se il poller non è ancora partito)
  const backupSource = SOFATIME_BACKUP_URL || SOFATIME_BACKUP_PATH;
  if (SOFATIME_BACKUP_URL || fs.existsSync(SOFATIME_BACKUP_PATH)) {
    const sofaData = await loadSofaTimeBackup(backupSource);
    if (sofaData) {
      const items = mediaType === 'movies' ? sofaData.movies : sofaData.shows;
      if (items && items.length > 0) {
        console.log(`[sofatime] Trovati ${items.length} elementi in backup per ${mediaType}`);
        return items.filter(x => stremioIdFromIds(x.ids));
      }
    }
  }

  return [];
}

// ─── Auto-refresh backup da URL (GitHub Gist o link diretto) ─────────────────
const backupStatus = {
  lastFetchAt: null,
  lastSuccessAt: null,
  lastError: null,
  moviesCount: 0,
  showsCount: 0,
  source: null
};
let cachedBackupData = null; // cache in memoria del backup corrente
let backupFetchInFlight = false;

async function fetchAndCacheBackup(force = false) {
  const url = SOFATIME_BACKUP_URL;
  if (!url) return; // nessun URL configurato
  if (backupFetchInFlight) return;
  backupFetchInFlight = true;
  backupStatus.lastFetchAt = new Date().toISOString();
  try {
    console.log('[backup-auto] Scarico backup da:', url);
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    // Controlla se il contenuto è cambiato (hash semplice)
    const hash = require('crypto').createHash('md5').update(text).digest('hex');
    if (!force && backupStatus._hash === hash) {
      console.log('[backup-auto] Nessuna modifica al backup (hash invariato)');
      backupStatus.lastSuccessAt = new Date().toISOString();
      backupStatus.lastError = null;
      return;
    }
    const { parseSofaTimeData } = require('./sofatimeParser');
    const parsed = parseSofaTimeData(text);
    if (!parsed || (!parsed.movies.length && !parsed.shows.length)) {
      throw new Error('Backup vuoto o formato non riconosciuto');
    }
    cachedBackupData = parsed;
    backupStatus._hash = hash;
    backupStatus.lastSuccessAt = new Date().toISOString();
    backupStatus.lastError = null;
    backupStatus.moviesCount = parsed.movies.length;
    backupStatus.showsCount = parsed.shows.length;
    backupStatus.source = url;
    console.log(`[backup-auto] ✅ Backup aggiornato: ${parsed.movies.length} film, ${parsed.shows.length} serie`);
    // Invalida i cataloghi così vengono ricostruiti con i nuovi dati
    ['sofatime-movies', 'sofatime-series', 'sofatime-movies-upcoming', 'sofatime-series-upcoming',
     'sofatime-movies-random', 'sofatime-series-random'].forEach(k => delete cache[k]);
  } catch (e) {
    backupStatus.lastError = e.message;
    console.warn('[backup-auto] ❌ Errore fetch backup:', e.message);
  } finally {
    backupFetchInFlight = false;
  }
}

function startBackupPoller() {
  if (!SOFATIME_BACKUP_URL || !BACKUP_REFRESH_MIN || BACKUP_REFRESH_MIN <= 0) return;
  console.log(`[backup-auto] Polling attivo ogni ${BACKUP_REFRESH_MIN} minuti`);
  // Prima fetch immediata all'avvio
  fetchAndCacheBackup(true);
  // Poi ogni N minuti
  setInterval(() => fetchAndCacheBackup(false), BACKUP_REFRESH_MIN * 60 * 1000).unref();
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const cache = {};
const metaCache = {};
const translationCache = new Map();

function saveCacheToDisk() {
  const tmp = CACHE_FILE + '.tmp-' + process.pid;
  fs.writeFile(tmp, JSON.stringify({ catalog: cache, meta: metaCache }), e => {
    if (e) return console.warn('[cache] save:', e.message);
    fs.rename(tmp, CACHE_FILE, e2 => e2 && console.warn('[cache] rename:', e2.message));
  });
}
function loadCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const d = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    Object.assign(cache, d.catalog || {});
    for (const [k, v] of Object.entries(d.meta || {})) {
      if (Date.now() - v.ts < META_CACHE_TTL && v.v === META_CACHE_VER) metaCache[k] = v;
    }
    console.log('[cache-disk] Caricati ' + Object.keys(cache).length + ' cataloghi, ' + Object.keys(metaCache).length + ' meta');
  } catch (e) { console.warn('[cache-disk] errore:', e.message); }
}

// ─── TMDB helpers ────────────────────────────────────────────────────────────
const POSTER_SIZE   = 'original';
const BACKDROP_SIZE = 'original';

function posterUrl(p)   { if (!p) return null; return p.startsWith('http') ? p : 'https://image.tmdb.org/t/p/' + POSTER_SIZE + p; }
function backdropUrl(p) { if (!p) return null; return p.startsWith('http') ? p : 'https://image.tmdb.org/t/p/' + BACKDROP_SIZE + p; }

function bestPosterPath(images, fallback) {
  const posters = images?.posters || [];
  if (!posters.length) return fallback;
  const prio = p => p.iso_639_1 === 'it' ? 0 : p.iso_639_1 === 'en' ? 1 : p.iso_639_1 === null ? 2 : 3;
  return [...posters].sort((a, b) => prio(a) - prio(b) || (b.vote_average || 0) - (a.vote_average || 0))[0]?.file_path || fallback;
}
function bestBackdropPath(images, fallback) {
  const bk = images?.backdrops || [];
  if (!bk.length) return fallback;
  const prio = p => p.iso_639_1 === null ? 0 : p.iso_639_1 === 'en' ? 1 : 2;
  return [...bk].sort((a, b) => prio(a) - prio(b) || (b.vote_average || 0) - (a.vote_average || 0))[0]?.file_path || fallback;
}
function localizedTitle(it, en) {
  const itTitle = it?.title || it?.name || '';
  const enTitle = en?.title || en?.name || '';
  const original = (it || en)?.original_title || (it || en)?.original_name || '';
  const originalLang = (it || en)?.original_language || '';
  if (itTitle && (itTitle !== original || originalLang === 'it')) return itTitle;
  return enTitle || itTitle;
}

async function translateToItalian(text) {
  if (!text || !text.trim()) return '';
  if (translationCache.has(text)) return translationCache.get(text);
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=it&dt=t&q=' + encodeURIComponent(text.slice(0, 1000));
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return text;
    const data = await res.json();
    const translated = data[0].map(c => c[0]).join('');
    if (translated && translated !== text) { translationCache.set(text, translated); return translated; }
    return text;
  } catch (e) { return text; }
}

function tmdbFetch(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { signal: ctrl.signal })
    .then(r => { clearTimeout(t); return r; })
    .catch(() => { clearTimeout(t); return null; });
}

// Arricchimento completo: Cinemeta → TMDB IT+EN → RPDB poster
async function enrich(ids, stremioType) {
  const tmdbType = stremioType === 'movie' ? 'movie' : 'tv';
  let result = null;

  // 1. Cinemeta (gratuito, ottima qualità dati base)
  if (ids.imdb && ids.imdb.startsWith('tt')) {
    try {
      const r = await tmdbFetch('https://v3-cinemeta.strem.io/meta/' + stremioType + '/' + ids.imdb + '.json');
      if (r?.ok) {
        const meta = (await r.json())?.meta;
        if (meta) result = { name: meta.name, poster: meta.poster, background: meta.background, description: meta.description || '', genres: meta.genres || [], imdbRating: meta.imdbRating, year: meta.year };
      }
    } catch (e) {}
  }

  // 2. TMDB: titolo/descrizione IT, poster migliore, backdrop migliore
  if (TMDB_KEY) {
    try {
      let tmdbId = ids.tmdb;
      if (!tmdbId && ids.imdb) {
        const r = await tmdbFetch('https://api.themoviedb.org/3/find/' + ids.imdb + '?external_source=imdb_id&api_key=' + TMDB_KEY);
        if (r?.ok) {
          const d = await r.json();
          const arr = tmdbType === 'movie' ? d.movie_results : d.tv_results;
          if (arr && arr[0]) tmdbId = arr[0].id;
        }
      }
      if (tmdbId) {
        const append = tmdbType === 'movie' ? 'images,release_dates' : 'images';
        const [itR, enR] = await Promise.all([
          tmdbFetch('https://api.themoviedb.org/3/' + tmdbType + '/' + tmdbId + '?language=it-IT&append_to_response=' + append + '&include_image_language=it,en,null&api_key=' + TMDB_KEY),
          tmdbFetch('https://api.themoviedb.org/3/' + tmdbType + '/' + tmdbId + '?language=en-US&api_key=' + TMDB_KEY)
        ]);
        const it = itR?.ok ? await itR.json() : null;
        const en = enR?.ok ? await enR.json() : null;
        if (it || en) {
          const base = it || en;
          const poster_path   = bestPosterPath(it?.images, base.poster_path);
          const backdrop_path = bestBackdropPath(it?.images, base.backdrop_path);
          let overview = it?.overview?.trim() || '';
          if (!overview && en?.overview) overview = await translateToItalian(en.overview.trim());

          // Data uscita
          let releaseDate = base.release_date || base.first_air_date || null;
          let upcoming = false;
          if (releaseDate && new Date(releaseDate) > new Date()) {
            upcoming = true;
            const formatted = new Date(releaseDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
            const label = stremioType === 'movie' ? 'Uscita prevista' : 'Prima stagione dal';
            overview = (overview ? overview + '\n\n' : '') + '📅 ' + label + ': ' + formatted;
          }

          result = {
            name: localizedTitle(it, en) || (result && result.name) || '',
            poster: posterUrl(poster_path) || (result && result.poster),
            background: backdropUrl(backdrop_path) || (result && result.background),
            description: (base.vote_average ? '⭐️ TMDb: ' + base.vote_average.toFixed(1) + '\n\n' : '') + (overview || (result && result.description) || ''),
            genres: ((it?.genres || en?.genres) || []).map(g => g.name),
            imdbRating: (result && result.imdbRating) || (base.vote_average ? String(base.vote_average.toFixed(1)) : undefined),
            year: parseInt(releaseDate || '0') || (result && result.year) || undefined,
            upcoming, releaseDate: upcoming ? releaseDate : null,
            tmdbId: String(tmdbId || '')
          };
        }
      }
    } catch (e) {}
  }

  // 3. RPDB poster con badge rating
  if (RPDB_KEY && ids.imdb && ids.imdb.startsWith('tt')) {
    result = result || {};
    result.poster = 'https://api.ratingposterdb.com/' + RPDB_KEY + '/imdb/poster-default/' + ids.imdb + '.jpg?fallback=true';
  } else if ((!result || !result.poster) && ids.imdb && ids.imdb.startsWith('tt')) {
    result = result || {};
    result.poster = 'https://images.metahub.space/poster/medium/' + ids.imdb + '/img';
  }

  return result;
}

// ─── Prefetch meta in background ─────────────────────────────────────────────
function prefetchMeta(metas, stremioType) {
  const toFetch = metas.filter(m => {
    const key = stremioType + ':' + m.id;
    const e = metaCache[key];
    return !e || e.v !== META_CACHE_VER || (Date.now() - e.ts) >= META_CACHE_TTL;
  });
  if (!toFetch.length) return;
  (async () => {
    const BATCH = stremioType === 'series' ? 3 : 8;
    const PAUSE = stremioType === 'series' ? 800 : 150;
    for (let i = 0; i < toFetch.length; i += BATCH) {
      await Promise.all(toFetch.slice(i, i + BATCH).map(async meta => {
        const key = stremioType + ':' + meta.id;
        try {
          const ids = idsFromStremioId(meta.id);
          if (ids.tmdb) ids.tmdb = parseInt(String(ids.tmdb));
          const e = await enrich(ids, stremioType);
          if (e) metaCache[key] = { meta: { ...meta, ...e }, ts: Date.now(), v: META_CACHE_VER };
        } catch (e2) {}
      }));
      if (i + BATCH < toFetch.length) await new Promise(r => setTimeout(r, PAUSE));
    }
    saveCacheToDisk();
    console.log('[meta-prefetch] ' + stremioType + ': ' + toFetch.length + ' titoli pre-caricati');
  })();
}

// ─── Catalog builder ──────────────────────────────────────────────────────────
async function buildCatalog(mediaType) {
  const stremioType = mediaType === 'movies' ? 'movie' : 'series';
  const items = await getPlanToWatch(mediaType);
  const upcomingList = [];
  const releasedList = [];

  const batch = items.map(it => {
    const id = stremioIdFromIds(it.ids);
    const key = stremioType + ':' + id;
    const e = metaCache[key]?.meta || null;
    
    return {
      id, type: stremioType, tmdbId: (e && e.tmdbId) || (it.ids && it.ids.tmdb) || '',
      name: (e && e.name) || it.title || id,
      poster: (e && e.poster) || (it.ids && it.ids.imdb ? `https://images.metahub.space/poster/medium/${it.ids.imdb}/img` : undefined),
      background: e && e.background,
      description: e && e.description,
      genres: (e && e.genres) || [],
      imdbRating: e && e.imdbRating,
      year: (e && e.year) || it.year,
      upcoming: !!(e && e.upcoming),
      releaseDate: e && e.releaseDate
    };
  });

  for (const m of batch) {
    if (m.upcoming) upcomingList.push(m);
    else releasedList.push(m);
  }

  // Ordina upcoming per data uscita
  upcomingList.sort((a, b) => new Date(a.releaseDate || 0) - new Date(b.releaseDate || 0));

  // Salva upcoming nella cache dedicata
  const upcomingId = stremioType === 'movie' ? 'sofatime-movies-upcoming' : 'sofatime-series-upcoming';
  cache[upcomingId] = { metas: upcomingList, ts: Date.now() };

  return releasedList;
}

// "Scegli per me": shuffle con 1 titolo per genere
async function buildRandom(stremioType, genre) {
  const sourceId = stremioType === 'movie' ? 'sofatime-movies' : 'sofatime-series';
  if (!cache[sourceId]) await getCatalogCached(sourceId, stremioType === 'movie' ? 'movies' : 'shows');
  let source = cache[sourceId]?.metas || [];
  
  // Filtra i titoli non ancora usciti (In arrivo)
  const currentYear = new Date().getFullYear();
  source = source.filter(m => {
    const key = stremioType + ':' + m.id;
    const e = metaCache[key]?.meta;
    if (e && e.upcoming) return false;
    if (m.upcoming) return false;
    const year = parseInt(m.year || (e && e.year) || 0);
    if (year > currentYear) return false;
    return true;
  });

  if (genre) source = source.filter(m => m.genres && m.genres.includes(genre));
  if (!source.length) return [];
  return [...source].sort(() => Math.random() - 0.5).slice(0, 100);
}

async function getCatalogCached(catalogId, mediaType, genre) {
  const stremioType = mediaType === 'movies' ? 'movie' : 'series';
  const isRandom    = catalogId.includes('random');
  const isUpcoming  = catalogId.includes('upcoming');

  if (isRandom) return buildRandom(stremioType, genre);

  if (isUpcoming) {
    if (cache[catalogId]) {
      // Promuovi automaticamente upcoming che ora sono usciti
      const now = new Date();
      const newReleased = (cache[catalogId].metas || []).filter(m => m.releaseDate && new Date(m.releaseDate) <= now);
      if (newReleased.length) {
        cache[catalogId] = { metas: (cache[catalogId].metas || []).filter(m => !newReleased.includes(m)), ts: Date.now() };
        const mainId = catalogId.replace('-upcoming', '');
        const cleaned = newReleased.map(({ upcoming, releaseDate, ...rest }) => rest);
        if (cache[mainId]) cache[mainId] = { metas: (cache[mainId].metas || []).concat(cleaned), ts: Date.now() };
        console.log('[upcoming→released] ' + newReleased.length + ' titoli spostati');
        saveCacheToDisk();
      }
      return cache[catalogId].metas;
    }
    // Triggera build del catalogo principale che popola anche upcoming
    await getCatalogCached(catalogId.replace('-upcoming', '').replace('-series', '-shows').replace('-movies', '-movies'), mediaType);
    return cache[catalogId]?.metas || [];
  }

  const entry = cache[catalogId];
  const stale = !entry || (Date.now() - entry.ts) >= CACHE_TTL;

  if (!stale) return entry.metas;

  // Stale-while-revalidate
  if (entry) {
    entry.ts = Date.now();
    (async () => {
      try {
        const metas = await buildCatalog(mediaType);
        cache[catalogId] = { metas, ts: Date.now() };
        prefetchMeta(metas, stremioType);
        saveCacheToDisk();
        console.log('[bg-refresh] ' + catalogId + ': ' + metas.length + ' elementi');
      } catch (e) { console.warn('[bg-refresh] ' + catalogId + ':', e.message); }
    })();
    return entry.metas;
  }

  // Prima build
  console.log('[cache miss] ' + catalogId + ' — aggiorno...');
  const metas = await buildCatalog(mediaType);
  cache[catalogId] = { metas, ts: Date.now() };
  prefetchMeta(metas, stremioType);
  saveCacheToDisk();
  return metas;
}

// ─── Keep-alive Render (evita cold start) ────────────────────────────────────
function startKeepAlive() {
  if (!process.env.RENDER) return;
  setInterval(async () => {
    try { await fetch(ADDON_URL + '/manifest.json'); console.log('[keep-alive] ping'); }
    catch (e) { console.warn('[keep-alive] ping fallito:', e.message); }
  }, 14 * 60 * 1000).unref();
}

// ─── Manifest con 4 cataloghi ─────────────────────────────────────────────────
const manifest = {
  id: 'it.samuele.sofatime.hub',
  version: '0.10.0',
  name: 'Sofa Time HUB',
  description: 'Sofa Time Hub - Addon Stremio/Nuvio per la tua watchlist Sofa Time (Backup + Live Sync + Scrobbling)',
  resources: ['catalog'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie',  id: 'sofatime-movies',          name: 'Da guardare',   extra: [{ name: 'skip' }, { name: 'genre', options: MOVIE_GENRES  }] },
    { type: 'series', id: 'sofatime-series',          name: 'Da guardare',   extra: [{ name: 'skip' }, { name: 'genre', options: SERIES_GENRES }] },
    { type: 'movie',  id: 'sofatime-movies-random',   name: 'Cosa guardare?', extra: [{ name: 'skip' }, { name: 'genre', options: MOVIE_GENRES  }] },
    { type: 'series', id: 'sofatime-series-random',   name: 'Cosa guardare?', extra: [{ name: 'skip' }, { name: 'genre', options: SERIES_GENRES }] }
  ],
  idPrefixes: ['tt', 'tmdb:'],
  logo: ADDON_URL + '/logo.png',
  background: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280'
};

async function main() {
  loadCacheFromDisk();

  // Importa automaticamente gli elementi visti da Stremio nello stato centrale del Hub.
  const stremioConfigured = !!STREMIO_AUTHKEY || !!(STREMIO_EMAIL && STREMIO_PASSWORD);
  if (!stremioConfigured) {
    console.warn('[scrobbler] ⚠️  STREMIO_AUTHKEY o credenziali Stremio mancanti: scrobbling disattivato.');
  } else {
    startScrobblerLoop(STREMIO_EMAIL, STREMIO_PASSWORD, async (watchedItem) => {
      console.log('[scrobbler] 🎬 Visto su Stremio:', watchedItem.name || watchedItem._id);
      const ids = idsFromStremioId(watchedItem._id);
      if (!Object.keys(ids).length) throw new Error('ID Stremio non supportato: ' + watchedItem._id);
      upsertEvent(HUB_STATE_FILE, {
        action: 'watched',
        progress: 100,
        [watchedItem.type === 'movie' ? 'movie' : 'show']: {
          ids,
          title: watchedItem.name || ''
        }
      }, 'stremio');
    }, { authKey: STREMIO_AUTHKEY, stateFile: WATCHED_STATE_FILE });
  }

  startKeepAlive();
  startBackupPoller(); // Auto-ricarica il backup dal Gist/URL ogni BACKUP_REFRESH_MIN minuti

  const builder = new addonBuilder(manifest);

  builder.defineCatalogHandler(async ({ type, id, extra }) => {
    try {
      const mediaType = type === 'movie' ? 'movies' : 'shows';
      const skip  = parseInt((extra && extra.skip)  || 0);
      const genre = (extra && extra.genre) || null;
      const all   = await getCatalogCached(id, mediaType, genre);
      let filtered = genre
        ? all.filter(m => m.genres && m.genres.includes(genre))
        : all;
      return { metas: filtered.slice(skip, skip + 100) };
    } catch (e) {
      console.error('[catalog]', e.message);
      return { metas: (cache[id] && cache[id].metas) || [] };
    }
  });

  const app = express();
  app.use(express.static(__dirname));
  app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'logo.png')));

  app.get('/sofatime-status', (req, res) => res.json({
    version: manifest.version,
    cataloghi: manifest.catalogs.map(c => c.id),
    backupConfigurato: !!(SOFATIME_BACKUP_URL || fs.existsSync(SOFATIME_BACKUP_PATH)),
    archivioHubAttivo: true,
    elementiSincronizzati: listState(HUB_STATE_FILE).length,
    scrobblerStremioAttivo: stremioConfigured,
    ingressoNuvioAttivo: !!SCROBBLE_TOKEN,
    keepAlive: !!process.env.RENDER,
    cataloghiInCache: Object.keys(cache).map(k => k + ':' + (cache[k]?.metas?.length || 0) + ' item')
  }));

  // Stato dettagliato del backup automatico
  app.get('/backup-status', (req, res) => res.json({
    backupUrl: SOFATIME_BACKUP_URL ? '✅ configurato' : '❌ non configurato (imposta SOFATIME_BACKUP_URL su Render)',
    pollingOgniMinuti: BACKUP_REFRESH_MIN,
    ultimaFetch: backupStatus.lastFetchAt,
    ultimoSuccesso: backupStatus.lastSuccessAt,
    ultimoErrore: backupStatus.lastError,
    film: backupStatus.moviesCount,
    serie: backupStatus.showsCount,
    cacheInMemoria: !!cachedBackupData
  }));

  // Endpoint per forzare il reload immediato del backup (utile dopo aver aggiornato il Gist)
  app.post('/backup-refresh', async (req, res) => {
    const token = process.env.CLEAR_CACHE_TOKEN || '';
    if (token && req.query.token !== token) return res.status(403).json({ error: 'forbidden' });
    await fetchAndCacheBackup(true);
    res.json({ ok: true, film: backupStatus.moviesCount, serie: backupStatus.showsCount, errore: backupStatus.lastError });
  });

  // Nuvio -> Hub: salva avanzamento e stato visto nell'archivio centrale.
  app.post('/api/scrobble', express.json({ limit: '64kb' }), async (req, res) => {
    if (!SCROBBLE_TOKEN) return res.status(503).json({ error: 'SCROBBLE_TOKEN non configurato' });
    const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
    if (!secureTokenEquals(SCROBBLE_TOKEN, supplied)) return res.status(403).json({ error: 'forbidden' });
    try {
      const item = upsertEvent(HUB_STATE_FILE, req.body || {}, 'nuvio');
      res.json({ ok: true, item });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Hub -> Nuvio: lettura completa o incrementale con ?since=<ISO-8601>.
  app.get('/api/sync', (req, res) => {
    if (!SCROBBLE_TOKEN) return res.status(503).json({ error: 'SCROBBLE_TOKEN non configurato' });
    const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
    if (!secureTokenEquals(SCROBBLE_TOKEN, supplied)) return res.status(403).json({ error: 'forbidden' });
    if (req.query.since && !Number.isFinite(Date.parse(req.query.since))) return res.status(400).json({ error: 'since non valido' });
    res.json({ ok: true, items: listState(HUB_STATE_FILE, req.query.since), serverTime: new Date().toISOString() });
  });

  // Interfaccia Web per caricare il backup comodamente dall'iPhone (elimina la necessità dello Shortcut)
  app.get('/upload', (req, res) => {
    res.type('html').send(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Carica Backup Sofa Time</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#0d0d1a;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;padding:2.5rem;background:#1a1a2e;border-radius:1.25rem;border:2px solid #e7b700;max-width:420px;box-shadow:0 0 40px #e7b70033}
h1{color:#e7b700;margin-bottom:.5rem;font-size:1.6rem}p{color:#aaa;margin-bottom:1.5rem;font-size:.95rem}
button{background:#e7b700;color:#0d0d1a;border:none;padding:12px 20px;font-size:1rem;font-weight:600;border-radius:8px;cursor:pointer;margin-top:1rem;width:100%}
button:disabled{background:#555;cursor:not-allowed}
input[type=file]{display:none}.file-label{display:block;padding:20px;background:#16213e;border:2px dashed #444;border-radius:8px;cursor:pointer;margin-bottom:1rem;color:#888;word-break:break-all}
.file-label:hover{border-color:#e7b700;color:#eee}</style></head>
<body><div class="box"><h1>🛋️ Aggiorna Sofa Time</h1><p>Seleziona il backup esportato da Sofa Time per aggiornare i tuoi cataloghi su Stremio.</p>
<label class="file-label" id="lbl" for="file">Seleziona file .zip o .json...</label><input type="file" id="file" accept=".json,.sofa3bk,.zip" />
<button id="btn" disabled>Carica ora</button><p id="msg" style="margin-top:1.5rem;font-weight:600;"></p></div>
<script>
const f = document.getElementById('file'), l = document.getElementById('lbl'), b = document.getElementById('btn'), m = document.getElementById('msg');
f.addEventListener('change', () => { if(f.files[0]) { l.textContent = f.files[0].name; l.style.borderColor = '#e7b700'; l.style.color = '#eee'; b.disabled = false; } });
b.addEventListener('click', () => {
  const r = new FileReader();
  r.onload = async (e) => {
    b.disabled = true; b.textContent = 'Caricamento in corso...'; m.textContent = '';
    try {
      const res = await fetch('/api/upload-backup' + location.search, { method: 'POST', body: e.target.result, headers: {'Content-Type':'application/octet-stream'} });
      const data = await res.json();
      if(data.ok) { m.style.color = '#4ade80'; m.textContent = '✅ Fatto! ' + data.film + ' film e ' + data.serie + ' serie aggiornati.'; b.textContent = 'Completato'; }
      else { m.style.color = '#f87171'; m.textContent = '❌ Errore: ' + (data.error||'Sconosciuto'); b.disabled = false; b.textContent = 'Riprova'; }
    } catch(err) { m.style.color = '#f87171'; m.textContent = '❌ Errore di rete'; b.disabled = false; b.textContent = 'Riprova'; }
  };
  r.readAsArrayBuffer(f.files[0]);
});
</script></body></html>`);
  });

  // API che riceve il file dall'interfaccia web e lo carica sul Gist
  app.post('/api/upload-backup', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
    // Protezione opzionale: se UPLOAD_TOKEN è impostato, richiede ?token=... corrispondente
    if (UPLOAD_TOKEN && req.query.token !== UPLOAD_TOKEN) return res.status(403).json({ error: 'forbidden' });
    try {
      let text = '';
      let parsed = { movies: [], shows: [] };
      const { parseSofaTimeData } = require('./sofatimeParser');

      // Cerca la firma ZIP (PK) per ignorare eventuali header multipart (es. Comandi Rapidi Apple)
      let zipBuffer = req.body;
      if (Buffer.isBuffer(zipBuffer)) {
        const zipStart = zipBuffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
        if (zipStart > 0) zipBuffer = zipBuffer.slice(zipStart);
      }

      // Se è un buffer zip (inizia con magic number PK)
      if (Buffer.isBuffer(zipBuffer) && zipBuffer.length > 4 && zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipBuffer);
        const zipEntries = zip.getEntries();
        zipEntries.forEach(entry => {
          if (entry.name.toLowerCase().includes('watchlist') && entry.name.endsWith('.json')) {
            const entryText = entry.getData().toString('utf8');
            const entryParsed = parseSofaTimeData(entryText);
            parsed.movies.push(...entryParsed.movies);
            parsed.shows.push(...entryParsed.shows);
          }
        });
        text = JSON.stringify(parsed);
      } else {
        text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
        parsed = parseSofaTimeData(text);
      }
      
      if (!parsed || (!parsed.movies.length && !parsed.shows.length)) return res.status(400).json({ error: 'Formato file non valido o vuoto' });
      
      // Aggiorna la cache in memoria e invalida i cataloghi
      cachedBackupData = parsed;
      backupStatus.moviesCount = parsed.movies.length;
      backupStatus.showsCount = parsed.shows.length;
      backupStatus.lastSuccessAt = new Date().toISOString();
      backupStatus.lastError = null;
      ['sofatime-movies', 'sofatime-series', 'sofatime-movies-upcoming', 'sofatime-series-upcoming', 'sofatime-movies-random', 'sofatime-series-random'].forEach(k => delete cache[k]);

      // Carica il file sul Gist se le credenziali sono presenti
      const gistId = process.env.GITHUB_GIST_ID;
      const gistToken = process.env.GITHUB_GIST_TOKEN;
      if (gistId && gistToken) {
        const ghRes = await fetch('https://api.github.com/gists/' + gistId, {
          method: 'PATCH',
          headers: { 'Authorization': 'Bearer ' + gistToken, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: { 'sofatime_backup.json': { content: text } } })
        });
        if (!ghRes.ok) console.warn('[upload] Errore caricamento Gist:', await ghRes.text());
        else console.log('[upload] Gist aggiornato con successo');
      }

      res.json({ ok: true, film: parsed.movies.length, serie: parsed.shows.length });
    } catch (e) {
      console.error('[upload] errore:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Cache-clear protetto da token
  const CLEAR_CACHE_TOKEN = process.env.CLEAR_CACHE_TOKEN || '';
  app.get('/clear-cache', (req, res) => {
    if (CLEAR_CACHE_TOKEN && req.query.token !== CLEAR_CACHE_TOKEN) return res.status(403).json({ error: 'forbidden' });
    Object.keys(cache).forEach(k => delete cache[k]);
    Object.keys(metaCache).forEach(k => delete metaCache[k]);
    console.log('[cache] svuotata manualmente');
    res.json({ ok: true, message: 'Cache svuotata' });
  });

  app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); next(); });
  app.use(getRouter(builder.getInterface()));

  app.listen(PORT, () => {
    console.log('Sofa Time HUB v' + manifest.version + ' pronto su ' + ADDON_URL);
    console.log('Manifest: ' + ADDON_URL + '/manifest.json');
    console.log('Cataloghi: ' + manifest.catalogs.length);
  });
}

if (require.main === module) {
  main().catch(err => { console.error('Errore fatale:', err.message); process.exit(1); });
}

module.exports = { writeFileAtomicSync, secureTokenEquals, idsFromStremioId, stremioIdFromIds, manifest };
