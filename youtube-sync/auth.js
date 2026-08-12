#!/usr/bin/env node
// Ottiene un refresh token OAuth per un account YouTube e lo salva cifrato su disco.
// Uso: node youtube-sync/auth.js account1   (poi: node youtube-sync/auth.js account2)
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { createOAuthClient, SCOPES } = require('./api');
const { serializeToken, writeFileAtomicSync } = require('../index.js');

function waitForAuthCode(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:' + port);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (error) {
        res.end('<h1>Autorizzazione negata</h1><p>Puoi chiudere questa finestra.</p>');
        server.close();
        reject(new Error('Autorizzazione negata: ' + error));
        return;
      }
      if (code) {
        res.end('<h1>Autorizzato</h1><p>Puoi chiudere questa finestra e tornare al terminale.</p>');
        server.close();
        resolve(code);
        return;
      }
      res.end('In attesa del codice di autorizzazione...');
    });
    server.listen(port, () => console.log(`In ascolto su http://localhost:${port} per il redirect OAuth...`));
    server.on('error', reject);
  });
}

async function main() {
  const label = process.argv[2];
  if (label !== 'account1' && label !== 'account2') {
    console.error('Uso: node youtube-sync/auth.js account1|account2');
    process.exit(1);
  }

  const redirectUri = process.env.YT_REDIRECT_URI || 'http://localhost:8090/oauth2callback';
  const port = new URL(redirectUri).port || 8090;
  const oauth2Client = createOAuthClient();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forza il rilascio del refresh_token anche se l'app è già stata autorizzata in passato
    scope: SCOPES,
    state: label
  });

  console.log('\n════════════════════════════════════════');
  console.log(` Autorizza l'account YouTube "${label}":`);
  console.log(' 1) Apri questo link nel browser, ACCEDI CON L\'ACCOUNT GIUSTO e autorizza:\n');
  console.log(' ' + authUrl);
  console.log('\n════════════════════════════════════════\n');

  const code = await waitForAuthCode(port);
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google non ha restituito un refresh_token. Revoca l'accesso su " +
      'https://myaccount.google.com/permissions e riprova.'
    );
  }

  const tokenPath = path.join(__dirname, 'tokens', label + '.token.json');
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  writeFileAtomicSync(tokenPath, serializeToken(tokens), { mode: 0o600 });
  try { fs.chmodSync(tokenPath, 0o600); } catch (e) {}

  const envVar = label === 'account1' ? 'YT_ACCOUNT1_REFRESH_TOKEN' : 'YT_ACCOUNT2_REFRESH_TOKEN';
  console.log(`✅ Token salvato per ${label} in ${tokenPath}`);
  console.log(`   In alternativa, su un deploy remoto (es. Render) puoi impostare direttamente:`);
  console.log(`   ${envVar}=${tokens.refresh_token}`);
}

main().catch(err => { console.error('Errore:', err.message); process.exit(1); });
