// Demone di sincronizzazione iscrizioni YouTube tra due account.
// Ogni YT_SYNC_INTERVAL_MIN minuti confronta le iscrizioni dei due account e propaga
// in automatico, in entrambe le direzioni, le nuove iscrizioni comparse dall'ultimo giro.
const fs = require('fs');
const path = require('path');
const { createOAuthClient, listAllSubscriptions, subscribeToChannel, computeSyncActions } = require('./api');
const { serializeToken, deserializeToken, writeFileAtomicSync } = require('../index.js');

const STATE_PATH = process.env.YT_STATE_PATH || path.join(__dirname, 'state.json');
const INTERVAL_MIN = parseInt(process.env.YT_SYNC_INTERVAL_MIN || '15');

function loadRefreshToken(label, envVar) {
  if (process.env[envVar]) return process.env[envVar];
  const tokenPath = path.join(__dirname, 'tokens', label + '.token.json');
  if (!fs.existsSync(tokenPath)) return null;
  const data = deserializeToken(fs.readFileSync(tokenPath, 'utf8'));
  return (data && data.refresh_token) || null;
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { known1: [], known2: [] };
    const d = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { known1: d.known1 || [], known2: d.known2 || [] };
  } catch (e) {
    console.warn('[youtube-sync] stato non leggibile, riparto da zero:', e.message);
    return { known1: [], known2: [] };
  }
}

function saveState(state) {
  writeFileAtomicSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function syncOnce(auth1, auth2) {
  const state = loadState();
  const known1 = new Set(state.known1);
  const known2 = new Set(state.known2);

  const [actual1, actual2] = await Promise.all([listAllSubscriptions(auth1), listAllSubscriptions(auth2)]);
  const { toAdd1, toAdd2 } = computeSyncActions({ actual1, actual2, known1, known2 });

  for (const channelId of toAdd2) {
    try {
      await subscribeToChannel(auth2, channelId);
      console.log(`[youtube-sync] account2 <= iscritto a "${actual1.get(channelId)}" (${channelId})`);
    } catch (e) {
      console.warn(`[youtube-sync] iscrizione a ${channelId} su account2 fallita:`, e.message);
    }
  }
  for (const channelId of toAdd1) {
    try {
      await subscribeToChannel(auth1, channelId);
      console.log(`[youtube-sync] account1 <= iscritto a "${actual2.get(channelId)}" (${channelId})`);
    } catch (e) {
      console.warn(`[youtube-sync] iscrizione a ${channelId} su account1 fallita:`, e.message);
    }
  }

  // Stato "noto" post-sync: ciò che è (o dovrebbe ormai essere) presente su ciascun account.
  // Include anche le eventuali disiscrizioni: chi non è più in `actual` esce dallo stato noto.
  saveState({
    known1: [...new Set([...actual1.keys(), ...toAdd1])],
    known2: [...new Set([...actual2.keys(), ...toAdd2])]
  });

  if (!toAdd1.length && !toAdd2.length) console.log('[youtube-sync] nessuna nuova iscrizione da propagare');
  return { toAdd1, toAdd2 };
}

async function main() {
  const refreshToken1 = loadRefreshToken('account1', 'YT_ACCOUNT1_REFRESH_TOKEN');
  const refreshToken2 = loadRefreshToken('account2', 'YT_ACCOUNT2_REFRESH_TOKEN');
  if (!refreshToken1 || !refreshToken2) {
    console.error('[youtube-sync] Refresh token mancante per uno o entrambi gli account.');
    console.error('Esegui prima: node youtube-sync/auth.js account1   e   node youtube-sync/auth.js account2');
    process.exit(1);
  }

  const auth1 = createOAuthClient(refreshToken1);
  const auth2 = createOAuthClient(refreshToken2);

  // Primo avvio: registra lo stato attuale senza propagare nulla, per non fondere
  // in blocco tutte le iscrizioni pregresse dei due account al primo giro.
  const state = loadState();
  if (!state.known1.length && !state.known2.length) {
    console.log('[youtube-sync] Primo avvio: registro lo stato attuale senza sincronizzare le iscrizioni pregresse...');
    const [actual1, actual2] = await Promise.all([listAllSubscriptions(auth1), listAllSubscriptions(auth2)]);
    saveState({ known1: [...actual1.keys()], known2: [...actual2.keys()] });
    console.log(`[youtube-sync] Stato iniziale registrato: ${actual1.size} iscrizioni su account1, ${actual2.size} su account2.`);
  }

  console.log(`[youtube-sync] Demone avviato — controllo ogni ${INTERVAL_MIN} minuti.`);
  const tick = () => syncOnce(auth1, auth2).catch(e => console.error('[youtube-sync] errore nel ciclo di sync:', e.message));
  await tick();
  setInterval(tick, INTERVAL_MIN * 60 * 1000);
}

if (require.main === module) {
  main().catch(err => { console.error('[youtube-sync] errore fatale:', err.message); process.exit(1); });
}

module.exports = { syncOnce, loadState, saveState };
