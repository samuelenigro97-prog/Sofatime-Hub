// ─── Caricamento .env senza dipendenze ──────────────────────────────────────
// Legge un file `.env` (se presente) e popola process.env PRIMA che il resto
// dell'app legga la configurazione. Non sovrascrive le variabili già impostate
// dall'ambiente, così i valori di Render → Environment continuano a vincere.
const fs = require('fs');
const path = require('path');

function loadEnv(envPath = path.join(__dirname, '.env')) {
  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    // Nessun file .env: normale in produzione (es. Render usa le env var native).
    return;
  }

  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    // Salta righe vuote e commenti.
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key) continue;

    let value = line.slice(eq + 1).trim();
    // Rimuove eventuali virgolette che avvolgono il valore.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Non sovrascrivere ciò che l'ambiente ha già definito.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

module.exports = { loadEnv };
