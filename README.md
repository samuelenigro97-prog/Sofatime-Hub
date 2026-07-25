# Sofatime Hub

Addon Stremio/Nuvio che porta le tue watchlist di **Sofa Time (TVSofa)** nei cataloghi Stremio, con bottoni per aggiungere, rimuovere e segnare come visto.

Supporta una **Modalità Ibrida**:
1. **Modalità Backup File (Offline / Natività 100%):** Carica direttamente un file di backup `.json` / `.sofa3bk` esportato da Sofa Time (locale o da un link URL/Gist remoto).
2. **Modalità Live Sync (Simkl / Trakt Bridge):** Sincronizzazione automatica e in tempo reale sfruttando il collegamento di Sofa Time verso Simkl o Trakt.

---

## Stato

- ✅ Parser universale per file di backup Sofa Time (`sofatimeParser.js`)
- ✅ Cataloghi watchlist (film + serie) con arricchimento TMDB / Cinemeta (poster, titolo italiano, voto IMDb, anno)
- ✅ Bottoni add / remove / segna-visto
- ✅ Endpoint diagnostico `/sofatime-status`

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
| `SIMKL_CLIENT_ID` | opzionale | Client ID Simkl (per la Modalità Live Sync) |
| `SIMKL_CLIENT_SECRET` | opzionale | Client Secret Simkl |
| `SIMKL_ACCESS_TOKEN` | opzionale su Render | Token utente Simkl ottenuto col PIN flow |
| `TMDB_KEY` | consigliata | Chiave TMDB per poster e titoli in italiano (fallback su Cinemeta) |
| `ADDON_URL` | consigliata | URL pubblico dell'addon (es. `https://sofatime-hub.onrender.com`) |
| `TOKEN_ENC_KEY` | opzionale | Cifra il token a riposo su disco |

---

## Comandi

- `npm start` — Avvia l'addon
- `npm test` — Esegue i test di sicurezza e il test del parser di Sofa Time
