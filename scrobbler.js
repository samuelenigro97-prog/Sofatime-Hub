/**
 * Scrobbler per Stremio -> Simkl / Sofa Time
 * Sincronizza automaticamente gli elementi segnati come visti su Stremio.
 */

const STREMIO_API = 'https://api.strem.io/api';
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

async function startScrobblerLoop(email, password, onNewWatchedItem) {
  console.log('[scrobbler] Avvio loop di scrobbling automatico...');
  const knownWatched = new Set();
  
  const check = async () => {
    const authKey = await getStremioAuthKey(email, password);
    if (!authKey) return;

    const items = await fetchStremioWatchedItems(authKey);
    for (const item of items) {
      const id = item._id;
      if (id && !knownWatched.has(id)) {
        knownWatched.add(id);
        if (onNewWatchedItem) {
          try {
            await onNewWatchedItem(item);
          } catch (e) {}
        }
      }
    }
  };

  // Controlla ogni 2 minuti
  setInterval(check, 2 * 60 * 1000);
  setTimeout(check, 5000);
}

module.exports = {
  getStremioAuthKey,
  fetchStremioWatchedItems,
  startScrobblerLoop
};
