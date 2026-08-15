# Sofatime Hub

[![Licenza MIT](https://img.shields.io/github/license/samuelenigro97-prog/Sofatime-Hub)](LICENSE.md)
[![Release](https://img.shields.io/github/v/release/samuelenigro97-prog/Sofatime-Hub?display_name=tag&sort=semver)](https://github.com/samuelenigro97-prog/Sofatime-Hub/releases)

Addon Stremio/Nuvio che porta le tue watchlist di **Sofa Time (TVSofa)** nei cataloghi Stremio.

Supporta una **Modalità Ibrida**:
1. **Modalità Backup File (Offline / Natività 100%):** Carica direttamente un file di backup `.json` / `.sofa3bk` esportato da Sofa Time (locale o da un link URL/Gist remoto).
2. **Modalità Live Sync (Simkl / Trakt Bridge):** Sincronizzazione automatica e in tempo reale sfruttando il collegamento di Sofa Time verso Simkl o Trakt.

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

### 2. Modalità Live Sync (Sofa Time + Simkl Sync)
1. Nella tua app Sofa Time sul telefono, attiva la sincronizzazione con Simkl (`Impostazioni -> Account / Sync -> Simkl`).
2. Registra un'app dev su Simkl per ottenere `SIMKL_CLIENT_ID` e `SIMKL_CLIENT_SECRET`.
3. Imposta le env var su Render o in locale.

---

## Variabili d'Ambiente

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `SOFATIME_BACKUP_PATH` | opzionale | Percorso locale del file di backup Sofa Time (default: `./sofatime_backup.json`) |
| `SOFATIME_BACKUP_URL` | opzionale | Link URL/Gist al file di backup Sofa Time |
| `BACKUP_REFRESH_MIN` | opzionale | Minuti tra un refresh automatico del backup da URL e il successivo (default: `30`, `0` per disabilitare) |
| `SIMKL_CLIENT_ID` | opzionale | Client ID Simkl (per la Modalità Live Sync) |
| `SIMKL_CLIENT_SECRET` | opzionale | Client Secret Simkl |
| `SIMKL_ACCESS_TOKEN` | opzionale su Render | Token utente Simkl ottenuto col PIN flow |
| `TMDB_KEY` | consigliata | Chiave TMDB per poster e titoli in italiano (fallback su Cinemeta) |
| `RPDB_KEY` | opzionale | Chiave RatingPosterDB per i poster con badge del voto |
| `STREMIO_EMAIL` | opzionale | Email account Stremio usato dallo scrobbler automatico |
| `STREMIO_PASSWORD` | opzionale | Password account Stremio per lo scrobbler (usa **solo** le env var, non scriverla nel codice) |
| `ADDON_URL` | consigliata | URL pubblico dell'addon (es. `https://sofatime-hub.onrender.com`) |
| `PORT` | opzionale | Porta del server (default: `7780`) |
| `TOKEN_ENC_KEY` | opzionale | Cifra il token Simkl a riposo su disco |
| `GITHUB_GIST_ID` | opzionale | ID del Gist su cui salvare il backup caricato da `/upload` |
| `GITHUB_GIST_TOKEN` | opzionale | Token GitHub per aggiornare il Gist di backup |
| `CLEAR_CACHE_TOKEN` | opzionale | Token per proteggere gli endpoint `/clear-cache` e `/backup-refresh` |
| `UPLOAD_TOKEN` | opzionale | Se impostato, protegge l'upload del backup: usa `/upload?token=IL_TUO_TOKEN` |

> ⚠️ **Sicurezza:** non inserire credenziali o chiavi API direttamente nel codice. Usa sempre le variabili d'ambiente (su Render: *Environment*). `STREMIO_EMAIL` e `STREMIO_PASSWORD` (usate dallo scrobbler) vanno impostate **solo** come env var; senza di esse lo scrobbling resta semplicemente disattivato.

---

## Comandi

- `npm start` — Avvia l'addon
- `npm test` — Esegue i test: sicurezza token, parser di Sofa Time e manifest/cataloghi

---

## Manutenzione

- **Versione:** quando pubblichi una modifica, aggiorna il numero in `package.json` **e** in `manifest.version` (dentro `index.js`): devono combaciare, altrimenti Stremio/Nuvio non rileva l'aggiornamento. Un test (`test/manifest.test.js`) verifica automaticamente che siano allineati.
