// Helper YouTube Data API v3: OAuth2 client, lettura iscrizioni, iscrizione a un canale.
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/youtube'];

function createOAuthClient(refreshToken) {
  const clientId = process.env.YT_CLIENT_ID || '';
  const clientSecret = process.env.YT_CLIENT_SECRET || '';
  const redirectUri = process.env.YT_REDIRECT_URI || 'http://localhost:8090/oauth2callback';
  if (!clientId || !clientSecret) throw new Error('YT_CLIENT_ID / YT_CLIENT_SECRET non impostate');
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  if (refreshToken) client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// Elenco completo (paginato) delle iscrizioni dell'account autenticato: Map<channelId, title>.
async function listAllSubscriptions(auth) {
  const youtube = google.youtube({ version: 'v3', auth });
  const channels = new Map();
  let pageToken;
  do {
    const res = await youtube.subscriptions.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken
    });
    for (const item of res.data.items || []) {
      const channelId = item.snippet && item.snippet.resourceId && item.snippet.resourceId.channelId;
      if (channelId) channels.set(channelId, item.snippet.title || channelId);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return channels;
}

async function subscribeToChannel(auth, channelId) {
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.subscriptions.insert({
    part: ['snippet'],
    requestBody: { snippet: { resourceId: { kind: 'youtube#channel', channelId } } }
  });
}

// Calcola cosa propagare in ciascuna direzione confrontando lo stato attuale
// con l'ultimo stato "noto" (già sincronizzato in un ciclo precedente).
// Confrontare contro `known` invece che riproporre sempre il diff tra actual1/actual2
// evita loop infiniti: un canale aggiunto dal demone stesso entra subito nel nuovo
// stato noto, quindi al giro successivo non risulta più "nuovo".
function computeSyncActions({ actual1, actual2, known1, known2 }) {
  const newIn1 = [...actual1.keys()].filter(id => !known1.has(id));
  const newIn2 = [...actual2.keys()].filter(id => !known2.has(id));
  const toAdd2 = newIn1.filter(id => !actual2.has(id));
  const toAdd1 = newIn2.filter(id => !actual1.has(id));
  return { toAdd1, toAdd2 };
}

module.exports = { SCOPES, createOAuthClient, listAllSubscriptions, subscribeToChannel, computeSyncActions };
