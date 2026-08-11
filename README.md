# Sofatime Hub

Addon Stremio/Nuvio che porta le tue watchlist di **Sofa Time (TVSofa)** nei cataloghi Stremio.

Supporta una **Modalità Ibrida**:
1. **Modalità Backup File (Offline / Natività 100%):** Carica direttamente un file di backup `.json` / `.sofa3bk` esportato da Sofa Time (locale o da un link URL/Gist remoto).
2. **Modalità Live Sync (Trakt Bridge):** SofaTime Hub è l'unica applicazione collegata a Trakt. Legge la cronologia Stremio e riceve gli eventi Nuvio tramite un endpoint protetto.

---

## Stato

- ✅ Parser universale per file di backup Sofa Time (`sofatimeParser.js`)
- ✅ Cataloghi watchlist (film + serie) con arricchimento TMDB / Cinemeta (poster, titolo italiano, voto IMDb, anno)
- ✅ Endpoint diagnostico `/sofatime-status`

### Cataloghi

L'addon espone quattro cataloghi, allineati ai nomi dell'app Sofa Time originale:

| Catalogo | Tipi | Descrizione |
|---|---|---|
| **Da guardare** | Film + Serie | La tua watchlist "da vedere" importata da Sofa Time |
| **Cosa guardare?** | Film + Serie | Selezione casuale dalla watchlist per scegliere al volo cosa vedere |

---

## Come Usarlo

### 1. Modalità Backup File (Sofa Time Export)
Esporta il file di backup dall'app Sofa Time sul telefono (`Impostazioni -> Gestione Dati -> Backup manuale / Esporta`).

- **File Locale:** Salva il file esportato come `sofatime_backup.json` nella cartella dell'addon (oppure imposta `SOFATIME_BACKUP_PATH=/percorso/al/file.json`).
- **URL Remoto:** Carica il file di backup su un Gist di GitHub o un server web e imposta la variabile d'ambiente `SOFATIME_BACKUP_URL=https://tuo-url.com/sofatime_backup.json`.

### 2. Modalità Live Sync (una sola app Trakt)
1. Registra SofaTime Hub come unica applicazione autorizzata su Trakt.
2. Imposta `TRAKT_CLIENT_ID` e `TRAKT_CLIENT_SECRET`.
3. In locale avvia il server e completa il device flow mostrato nel terminale. Su Render imposta anche `TRAKT_ACCESS_TOKEN` e `TRAKT_REFRESH_TOKEN`.
4. Per Stremio imposta preferibilmente `STREMIO_AUTHKEY` (email/password sono solo un fallback).
5. Per Nuvio imposta `SCROBBLE_TOKEN`: il client modificato invierà gli eventi a `POST /api/scrobble`, e solo il server parlerà con Trakt.

Il ponte Nuvio accetta `Authorization: Bearer <SCROBBLE_TOKEN>` e un payload compatibile con lo scrobble Trakt:

```json
{
  "action": "start",
  "progress": 12.5,
  "movie": { "ids": { "imdb": "tt1375666" } }
}
```

`action` può essere `start`, `pause` o `stop`; per le serie si invia `episode` al posto di `movie`.

---

## Variabili d'Ambiente

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `SOFATIME_BACKUP_PATH` | opzionale | Percorso locale del file di backup Sofa Time (default: `./sofatime_backup.json`) |
| `SOFATIME_BACKUP_URL` | opzionale | Link URL/Gist al file di backup Sofa Time |
| `BACKUP_REFRESH_MIN` | opzionale | Minuti tra un refresh automatico del backup da URL e il successivo (default: `30`, `0` per disabilitare) |
| `TRAKT_CLIENT_ID` | opzionale | Client ID dell'unica applicazione Trakt |
| `TRAKT_CLIENT_SECRET` | opzionale | Client Secret dell'applicazione Trakt |
| `TRAKT_REDIRECT_URI` | consigliato | Redirect URI dell'app Trakt; default `urn:ietf:wg:oauth:2.0:oob` |
| `TRAKT_ACCESS_TOKEN` | obbligatorio su Render | Access token Trakt ottenuto col device flow |
| `TRAKT_REFRESH_TOKEN` | consigliato su Render | Refresh token Trakt per il rinnovo automatico |
| `TMDB_KEY` | consigliata | Chiave TMDB per poster e titoli in italiano (fallback su Cinemeta) |
| `RPDB_KEY` | opzionale | Chiave RatingPosterDB per i poster con badge del voto |
| `STREMIO_AUTHKEY` | consigliata | Auth key Stremio usata per leggere la cronologia senza conservare la password |
| `STREMIO_EMAIL` | opzionale | Email Stremio, fallback se `STREMIO_AUTHKEY` non è disponibile |
| `STREMIO_PASSWORD` | opzionale | Password Stremio, fallback; usa solo le env var |
| `SCROBBLE_TOKEN` | necessario per Nuvio | Protegge `POST /api/scrobble` |
| `ADDON_URL` | consigliata | URL pubblico dell'addon (es. `https://sofatime-hub.onrender.com`) |
| `PORT` | opzionale | Porta del server (default: `7780`) |
| `TOKEN_ENC_KEY` | opzionale | Cifra il token Trakt a riposo su disco |
| `GITHUB_GIST_ID` | opzionale | ID del Gist su cui salvare il backup caricato da `/upload` |
| `GITHUB_GIST_TOKEN` | opzionale | Token GitHub per aggiornare il Gist di backup |
| `CLEAR_CACHE_TOKEN` | opzionale | Token per proteggere gli endpoint `/clear-cache` e `/backup-refresh` |
| `UPLOAD_TOKEN` | opzionale | Se impostato, protegge l'upload del backup: usa `/upload?token=IL_TUO_TOKEN` |

> ⚠️ **Sicurezza:** non inserire credenziali, token o chiavi API nel codice. Usa le variabili d'ambiente di Render. Non collegare direttamente Stremio e Nuvio a Trakt: SofaTime Hub deve rimanere l'unico writer.

---

## Comandi

- `npm start` — Avvia l'addon
- `npm test` — Esegue i test: sicurezza token, parser di Sofa Time e manifest/cataloghi

---

## Manutenzione

- **Versione:** quando pubblichi una modifica, aggiorna il numero in `package.json` **e** in `manifest.version` (dentro `index.js`): devono combaciare, altrimenti Stremio/Nuvio non rileva l'aggiornamento. Un test (`test/manifest.test.js`) verifica automaticamente che siano allineati.
