const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadSofaTimeBackup } = require('./sofatimeParser');

// ─── Config ───────────────────────────────────────────────────────────────────
const SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID || '';
const SIMKL_CLIENT_SECRET = process.env.SIMKL_CLIENT_SECRET || '';
const SOFATIME_BACKUP_PATH = process.env.SOFATIME_BACKUP_PATH || path.join(__dirname, 'sofatime_backup.json');
const SOFATIME_BACKUP_URL = process.env.SOFATIME_BACKUP_URL || '';
const TMDB_KEY = process.env.TMDB_KEY || '';

const PORT = parseInt(process.env.PORT || '7780');
const ADDON_URL = (process.env.ADDON_URL || ('http://localhost:' + PORT)).replace(/\/$/, '');
const TOKEN_FILE = path.join(__dirname, 'simkl_token.json');
const CACHE_FILE = path.join(__dirname, 'cache_data.json');
const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || '';
const STREMIO_AUTHKEY = process.env.STREMIO_AUTHKEY || '';

const SIMKL_API = 'https://api.simkl.com';
const CACHE_TTL = 60 * 1000;
const META_CACHE_TTL = 24 * 60 * 60 * 1000;

let accessToken = process.env.SIMKL_ACCESS_TOKEN || null;

// ─── Persistenza sicura: cifratura token + scritture atomiche ─────────────────
const ENC_PREFIX = 'enc:v1:';
function encKeyBytes() { return crypto.createHash('sha256').update(TOKEN_ENC_KEY).digest(); }
function serializeToken(obj) {
  const json = JSON.stringify(obj, null, 2);
  if (!TOKEN_ENC_KEY) return json;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKeyBytes(), iv);
  const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return ENC_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}
function deserializeToken(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s.startsWith(ENC_PREFIX)) return JSON.parse(s);
  if (!TOKEN_ENC_KEY) { console.warn('[token] dato cifrato ma TOKEN_ENC_KEY assente'); return null; }
  const buf = Buffer.from(s.slice(ENC_PREFIX.length), 'base64');
  const dec = crypto.createDecipheriv('aes-256-gcm', encKeyBytes(), buf.subarray(0, 12));
  dec.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([dec.update(buf.subarray(28)), dec.final()]).toString('utf8'));
}
function writeFileAtomicSync(file, data, opts) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data, opts);
  fs.renameSync(tmp, file);
}
function saveToken(tok) {
  accessToken = tok.access_token || accessToken;
  try {
    writeFileAtomicSync(TOKEN_FILE, serializeToken(tok), { mode: 0o600 });
    try { fs.chmodSync(TOKEN_FILE, 0o600); } catch (e) {}
  } catch (e) { console.warn('[token] salvataggio fallito:', e.message); }
}
function loadToken() {
  if (accessToken) { console.log('[auth] token da env'); return true; }
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const d = deserializeToken(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (d && d.access_token) { accessToken = d.access_token; console.log('[auth] token da file'); return true; }
    }
  } catch (e) {}
  return false;
}

// ─── Auth Simkl: PIN flow (device) ────────────────────────────────────────────
async function authenticatePinFlow() {
  if (!SIMKL_CLIENT_ID) return false;
  const r = await fetch(SIMKL_API + '/oauth/pin?client_id=' + SIMKL_CLIENT_ID);
  const j = await r.json();
  console.log('\n════════════════════════════════════════');
  console.log(' Autorizza Sofatime Hub (Simkl Sync):');
  console.log(' 1) Vai su: ' + (j.verification_url || 'https://simkl.com/pin'));
  console.log(' 2) Inserisci il codice: ' + j.user_code);
  console.log('════════════════════════════════════════\n');
  const userCode = j.user_code;
  const interval = (j.interval || 5) * 1000;
  const deadline = Date.now() + (j.expires_in || 900) * 1000;
  while (Date.now() < deadline) {
    await new Promise(res => setTimeout(res, interval));
    try {
      const pj = await (await fetch(SIMKL_API + '/oauth/pin/' + userCode + '?client_id=' + SIMKL_CLIENT_ID)).json();
      if (pj.result === 'OK' && pj.access_token) { saveToken({ access_token: pj.access_token }); console.log('[auth] ✅ autorizzato'); return true; }
    } catch (e) {}
  }
  throw new Error('Autorizzazione Simkl scaduta.');
}

// ─── Client HTTP Simkl ────────────────────────────────────────────────────────
function simklHeaders() {
  const h = { 'Content-Type': 'application/json', 'simkl-api-key': SIMKL_CLIENT_ID };
  if (accessToken) h['Authorization'] = 'Bearer ' + accessToken;
  return h;
}
async function simklGet(pathUrl) {
  if (!SIMKL_CLIENT_ID) return null;
  const res = await fetch(SIMKL_API + pathUrl, { headers: simklHeaders() });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Simkl GET ' + pathUrl + ' → ' + res.status);
  return res.json();
}
async function simklPost(pathUrl, body) {
  if (!SIMKL_CLIENT_ID) return { ok: false, status: 400, json: { message: 'SIMKL_CLIENT_ID non impostato' } };
  const res = await fetch(SIMKL_API + pathUrl, { method: 'POST', headers: simklHeaders(), body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

function idsFromStremioId(stremioId) {
  if (stremioId.startsWith('tt')) return { imdb: stremioId };
  if (stremioId.startsWith('tmdb:')) return { tmdb: parseInt(stremioId.slice(5)) };
  return {};
}
function stremioIdFromSimkl(ids) {
  if (!ids) return null;
  if (ids.imdb) return ids.imdb;
  if (ids.tmdb) return 'tmdb:' + ids.tmdb;
  return null;
}

// Watchlist "plan to watch" o Backup Sofa Time. simklType: 'movies' | 'shows'
async function getPlanToWatch(simklType) {
  // 1. Prova prima il backup Sofa Time se specificato o se esiste il file
  const backupSource = SOFATIME_BACKUP_URL || SOFATIME_BACKUP_PATH;
  if (SOFATIME_BACKUP_URL || fs.existsSync(SOFATIME_BACKUP_PATH)) {
    const sofaData = await loadSofaTimeBackup(backupSource);
    if (sofaData) {
      const items = simklType === 'movies' ? sofaData.movies : sofaData.shows;
      if (items && items.length > 0) {
        console.log(`[sofatime] Trovati ${items.length} elementi in backup per ${simklType}`);
        return items.filter(x => stremioIdFromSimkl(x.ids));
      }
    }
  }

  // 2. Se non c'è backup file o se è vuoto, usa l'API Simkl Sync
  if (SIMKL_CLIENT_ID) {
    const data = await simklGet('/sync/all-items/' + simklType + '/plantowatch?extended=full');
    if (!data) return [];
    return (data[simklType] || []).map(entry => {
      const o = entry.movie || entry.show || {};
      return { ids: o.ids || {}, title: o.title, year: o.year };
    }).filter(x => stremioIdFromSimkl(x.ids));
  }

  return [];
}
async function addToWatchlist(stremioId, simklType) {
  const key = simklType === 'movies' ? 'movies' : 'shows';
  return simklPost('/sync/add-to-list', { [key]: [{ to: 'plantowatch', ids: idsFromStremioId(stremioId) }] });
}
async function removeFromWatchlist(stremioId, simklType) {
  const key = simklType === 'movies' ? 'movies' : 'shows';
  return simklPost('/sync/history/remove', { [key]: [{ ids: idsFromStremioId(stremioId) }] });
}
async function markWatched(stremioId, simklType) {
  const key = simklType === 'movies' ? 'movies' : 'shows';
  return simklPost('/sync/history', { [key]: [{ ids: idsFromStremioId(stremioId), watched_at: new Date().toISOString() }] });
}

// ─── Cache leggera ────────────────────────────────────────────────────────────
const cache = {};
const metaCache = {};
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
    for (const [k, v] of Object.entries(d.meta || {})) if (Date.now() - v.ts < META_CACHE_TTL) metaCache[k] = v;
  } catch (e) {}
}

// ─── Arricchimento TMDB (poster, titolo IT, voto IMDb da Cinemeta) ────────────
function tmdbImg(p, size) { return p ? 'https://image.tmdb.org/t/p/' + (size || 'original') + p : ''; }
const imdbRatingCache = new Map();
async function imdbRatingFromCinemeta(imdb, stremioType) {
  if (!imdb || !imdb.startsWith('tt')) return undefined;
  const hit = imdbRatingCache.get(imdb);
  if (hit && Date.now() - hit.ts < 7 * 24 * 3600 * 1000) return hit.r;
  try {
    const r = await fetch('https://v3-cinemeta.strem.io/meta/' + stremioType + '/' + imdb + '.json');
    const rating = r.ok ? ((await r.json())?.meta?.imdbRating || undefined) : undefined;
    imdbRatingCache.set(imdb, { r: rating, ts: Date.now() });
    return rating;
  } catch (e) { return undefined; }
}
async function enrich(ids, stremioType) {
  const tmdbType = stremioType === 'movie' ? 'movie' : 'tv';
  let tmdbId = ids.tmdb;
  try {
    if (!tmdbId && ids.imdb && TMDB_KEY) {
      const r = await fetch('https://api.themoviedb.org/3/find/' + ids.imdb + '?external_source=imdb_id&api_key=' + TMDB_KEY);
      if (r.ok) { const d = await r.json(); const arr = tmdbType === 'movie' ? d.movie_results : d.tv_results; if (arr && arr[0]) tmdbId = arr[0].id; }
    }
    if (!tmdbId && !TMDB_KEY && ids.imdb) {
      // Cinemeta fallback se TMDB_KEY manca
      const r = await fetch('https://v3-cinemeta.strem.io/meta/' + stremioType + '/' + ids.imdb + '.json');
      if (r.ok) {
        const meta = (await r.json())?.meta;
        if (meta) {
          return {
            name: meta.name || '',
            poster: meta.poster,
            background: meta.background,
            description: meta.description || '',
            genres: meta.genres || [],
            imdbRating: meta.imdbRating,
            year: meta.year
          };
        }
      }
    }
    if (!tmdbId) return null;
    const [itR, enR, rating] = await Promise.all([
      fetch('https://api.themoviedb.org/3/' + tmdbType + '/' + tmdbId + '?language=it-IT&api_key=' + TMDB_KEY),
      fetch('https://api.themoviedb.org/3/' + tmdbType + '/' + tmdbId + '?language=en-US&api_key=' + TMDB_KEY),
      imdbRatingFromCinemeta(ids.imdb, stremioType)
    ]);
    const it = itR.ok ? await itR.json() : null;
    const en = enR.ok ? await enR.json() : null;
    if (!it && !en) return null;
    const b = it || en;
    return {
      name: (it && (it.title || it.name)) || (en && (en.title || en.name)) || '',
      poster: tmdbImg(b.poster_path), background: tmdbImg(b.backdrop_path),
      description: (it && it.overview) || (en && en.overview) || '',
      genres: ((it && it.genres) || (en && en.genres) || []).map(g => g.name),
      imdbRating: rating || (b.vote_average ? String(b.vote_average.toFixed(1)) : undefined),
      year: parseInt(((b.release_date || b.first_air_date) || '').slice(0, 4)) || undefined
    };
  } catch (e) { return null; }
}

async function buildCatalog(simklType) {
  const stremioType = simklType === 'movies' ? 'movie' : 'series';
  const items = await getPlanToWatch(simklType);
  const metas = [];
  for (let i = 0; i < items.length; i += 10) {
    const res = await Promise.all(items.slice(i, i + 10).map(async it => {
      const id = stremioIdFromSimkl(it.ids);
      const e = await enrich(it.ids, stremioType);
      return {
        id, type: stremioType, name: (e && e.name) || it.title || id,
        poster: e && e.poster, background: e && e.background, description: e && e.description,
        genres: e && e.genres, imdbRating: e && e.imdbRating, year: (e && e.year) || it.year
      };
    }));
    metas.push(...res);
  }
  return metas;
}
async function getCatalogCached(catalogId, simklType) {
  const entry = cache[catalogId];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.metas;
  if (entry) {
    entry.ts = Date.now();
    buildCatalog(simklType).then(m => { cache[catalogId] = { metas: m, ts: Date.now() }; saveCacheToDisk(); }).catch(() => {});
    return entry.metas;
  }
  const metas = await buildCatalog(simklType);
  cache[catalogId] = { metas, ts: Date.now() };
  saveCacheToDisk();
  return metas;
}

// ─── Manifest ──────────────────────────────────────────────────────────────────
const manifest = {
  id: 'it.samuele.sofatime.hub',
  version: '0.1.0',
  name: 'Sofatime Hub',
  description: 'La tua watchlist di Sofa Time (TVSofa) in Stremio/Nuvio: Backup locale/URL e Live Sync.',
  resources: ['catalog', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie',  id: 'sofatime-movies', name: 'Sofa Time - Film da vedere', extra: [{ name: 'skip' }] },
    { type: 'series', id: 'sofatime-series', name: 'Sofa Time - Serie da vedere', extra: [{ name: 'skip' }] }
  ],
  idPrefixes: ['tt', 'tmdb:'],
  logo: ADDON_URL + '/logo.png',
  background: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280'
};

async function main() {
  loadCacheFromDisk();
  if (SIMKL_CLIENT_ID && !loadToken()) {
    if (process.env.RENDER) throw new Error('Token mancante: imposta SIMKL_ACCESS_TOKEN nelle env var di Render.');
    await authenticatePinFlow();
  }

  const builder = new addonBuilder(manifest);

  builder.defineCatalogHandler(async ({ type, id, extra }) => {
    try {
      const simklType = type === 'movie' ? 'movies' : 'shows';
      const skip = parseInt((extra && extra.skip) || 0);
      const all = await getCatalogCached(id, simklType);
      return { metas: all.slice(skip, skip + 100) };
    } catch (e) {
      console.error('[catalog]', e.message);
      return { metas: (cache[id] && cache[id].metas) || [] };
    }
  });

  builder.defineStreamHandler(({ type, id }) => {
    const simklType = type === 'movie' ? 'movies' : 'shows';
    const cid = 'sofatime-' + (type === 'movie' ? 'movies' : 'series');
    const inList = !!(((cache[cid] && cache[cid].metas) || []).find(m => m.id === id));
    return { streams: [
      { name: 'Sofa Time', description: inList ? '🗑️ Rimuovi da Da vedere' : '➕ Aggiungi a Da vedere',
        externalUrl: ADDON_URL + '/simkl/' + (inList ? 'remove' : 'add') + '/' + simklType + '/' + id },
      { name: 'Sofa Time', description: '✅ Segna come visto',
        externalUrl: ADDON_URL + '/simkl/watched/' + simklType + '/' + id }
    ] };
  });

  const app = express();

  app.get('/sofatime-status', (req, res) => res.json({
    version: manifest.version,
    backupConfigurato: !!(SOFATIME_BACKUP_URL || fs.existsSync(SOFATIME_BACKUP_PATH)),
    simklSyncConfigurato: !!SIMKL_CLIENT_ID && !!accessToken,
    stremioAuthkey: !!STREMIO_AUTHKEY,
    cataloghiInCache: Object.keys(cache)
  }));

  const htmlPage = (title, msg, color) => `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;padding:2rem;background:#16213e;border-radius:1rem;border:2px solid ${color};max-width:400px}
h1{color:${color}}p{color:#aaa}</style></head><body><div class="box"><h1>${title}</h1><p>${msg}</p></div></body></html>`;
  const confirmPage = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Attendere…</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;padding:2rem;background:#16213e;border-radius:1rem;border:2px solid #6366f1}</style></head>
<body><div class="box"><h1>⏳ Un attimo…</h1><p>Aggiorno Sofa Time.</p></div>
<script>fetch(location.pathname,{method:'POST',headers:{'X-Confirm':'1'}}).then(r=>r.text()).then(h=>{document.open();document.write(h);document.close()}).catch(()=>{document.body.innerHTML='<div class=box><h1>❌ Errore</h1></div>'})</script></body></html>`;

  const rlHits = new Map();
  const rateLimited = req => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const arr = (rlHits.get(ip) || []).filter(t => now - t < 60000);
    arr.push(now); rlHits.set(ip, arr);
    return arr.length > 12;
  };
  const looksLikeBot = req => {
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    return !ua || /bot|crawl|spider|slurp|preview|scan|curl|wget|python-requests|headless|facebookexternalhit|whatsapp|telegram/.test(ua);
  };
  const invalidate = simklType => {
    const cid = 'sofatime-' + (simklType === 'movies' ? 'movies' : 'series');
    delete cache[cid];
    setImmediate(() => getCatalogCached(cid, simklType).catch(() => {}));
  };
  const mutationRoute = (routePath, run) => {
    app.get(routePath, (req, res) => res.type('html').send(confirmPage));
    app.post(routePath, async (req, res) => {
      if (looksLikeBot(req) || req.get('X-Confirm') !== '1') return res.status(403).send('forbidden');
      if (rateLimited(req)) return res.status(429).send('too many requests');
      try { res.type('html').send(await run(req.params)); }
      catch (e) { res.status(500).send(htmlPage('❌ Errore', e.message, '#f87171')); }
    });
  };

  mutationRoute('/simkl/add/:type/:id', async ({ type, id }) => {
    const r = await addToWatchlist(id, type);
    if (!r.ok) return htmlPage('❌ Errore', 'Sofa Time Sync ha risposto ' + r.status, '#f87171');
    invalidate(type); console.log('[watchlist] Aggiunto:', id);
    return htmlPage('✅ Aggiunto!', 'Aggiunto a "Da vedere" su Sofa Time.', '#4ade80');
  });
  mutationRoute('/simkl/remove/:type/:id', async ({ type, id }) => {
    const r = await removeFromWatchlist(id, type);
    if (!r.ok) return htmlPage('❌ Errore', 'Sofa Time Sync ha risposto ' + r.status, '#f87171');
    invalidate(type); console.log('[watchlist] Rimosso:', id);
    return htmlPage('🗑️ Rimosso!', 'Rimosso da "Da vedere" su Sofa Time.', '#fb923c');
  });
  mutationRoute('/simkl/watched/:type/:id', async ({ type, id }) => {
    const r = await markWatched(id, type);
    if (!r.ok) return htmlPage('❌ Errore', 'Sofa Time Sync ha risposto ' + r.status, '#f87171');
    invalidate(type); console.log('[watched] Segnato:', id);
    return htmlPage('✅ Segnato come visto!', 'Sofa Time aggiornato.', '#4ade80');
  });

  app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); next(); });
  app.use(getRouter(builder.getInterface()));

  app.listen(PORT, () => {
    console.log('Sofatime Hub pronto su ' + ADDON_URL);
    console.log('Manifest: ' + ADDON_URL + '/manifest.json');
  });
}

if (require.main === module) {
  main().catch(err => { console.error('Errore fatale:', err.message); process.exit(1); });
}

module.exports = { serializeToken, deserializeToken, writeFileAtomicSync, ENC_PREFIX, idsFromStremioId, stremioIdFromSimkl, manifest };
