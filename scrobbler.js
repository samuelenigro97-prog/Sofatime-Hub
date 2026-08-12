/**
 * Scrobbler per Stremio -> Sofa Time Hub
 * Sincronizza automaticamente gli elementi segnati come visti su Stremio.
 */

const STREMIO_API = 'https://api.strem.io/api';
const fs = require('fs');
let cachedAuthKey = process.env.STREMIO_AUTHKEY || null;

async function getStremioAuthKey(email, password) {
  if (cachedAuthKey) return cachedAuthKey;
  if (!email || !password) return null;
  try {
    const res = await fetch(`${STREMIO_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'login', email, password })
    });
    const data = await res.json();
    if (data.result && data.result.authKey) {
      cachedAuthKey = data.result.authKey;
      console.log('[scrobbler] Autenticazione Stremio riuscita ✅');
      return cachedAuthKey;
    }
  } catch (e) {
    console.warn('[scrobbler] Login Stremio fallito:', e.message);
  }
  return null;
}

async function fetchStremioWatchedItems(authKey) {
  if (!authKey) return [];
  try {
    const res = await fetch(`${STREMIO_API}/datastoreGet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, collection: 'libraryItem', all: true })
    });
    const data = await res.json();
    if (data.result) {
      const items = data.result || [];
      return items.filter(item => item.state && (item.state.timesWatched > 0 || item.state.watched || (item.state.flagged && item.state.flagged === 1)));
    }
  } catch (e) {
    console.warn('[scrobbler] Errore datastoreGet Stremio:', e.message);
  }
  return [];
}

function loadKnownWatched(stateFile) {
  if (!stateFile) return new Set();
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

function saveKnownWatched(stateFile, knownWatched) {
  if (!stateFile) return;
  const tmp = stateFile + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify([...knownWatched].sort()), { mode: 0o600 });
  fs.renameSync(tmp, stateFile);
}

async function startScrobblerLoop(email, password, onNewWatchedItem, options = {}) {
  console.log('[scrobbler] Avvio loop di scrobbling automatico...');
  if (options.authKey) cachedAuthKey = options.authKey;
  const knownWatched = loadKnownWatched(options.stateFile);
  
  const check = async () => {
    const authKey = await getStremioAuthKey(email, password);
    if (!authKey) return;

    const items = await fetchStremioWatchedItems(authKey);
    for (const item of items) {
      const id = item._id;
      if (id && !knownWatched.has(id)) {
        if (onNewWatchedItem) {
          try {
            await onNewWatchedItem(item);
            knownWatched.add(id);
            saveKnownWatched(options.stateFile, knownWatched);
          } catch (e) {
            console.warn('[scrobbler] Invio fallito, ritenterò:', e.message);
          }
        }
      }
    }
  };

  // Controlla ogni 2 minuti
  setInterval(check, options.intervalMs || 2 * 60 * 1000).unref();
  setTimeout(check, options.initialDelayMs || 5000).unref();
}

module.exports = {
  getStremioAuthKey,
  fetchStremioWatchedItems,
  loadKnownWatched,
  saveKnownWatched,
  startScrobblerLoop
};
