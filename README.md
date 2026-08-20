# 🛋️ Sofatime Hub

[![Licenza MIT](https://img.shields.io/github/license/samuelenigro97-prog/Sofatime-Hub)](LICENSE.md)
[![Release](https://img.shields.io/github/v/release/samuelenigro97-prog/Sofatime-Hub?display_name=tag&sort=semver)](https://github.com/samuelenigro97-prog/Sofatime-Hub/releases)

Addon **Stremio / Nuvio** che porta le watchlist dell'app **Sofa Time (TVSofa)**
dentro i cataloghi di Stremio, con poster e titoli in italiano.

> 📌 **Riprendi da qui:** stato dei lavori, problemi aperti, infrastruttura e
> prossimi passi sono in **[docs/STATO_LAVORI.md](docs/STATO_LAVORI.md)**.
> Storico delle versioni in [CHANGELOG.md](CHANGELOG.md).

**Versione corrente: 0.8.0** · Node.js ≥ 18 · nessun database

---

## Indice

1. [Cosa fa](#cosa-fa)
2. [Come funziona (architettura)](#come-funziona-architettura)
3. [Cataloghi esposti](#cataloghi-esposti)
4. [Le due modalità di sorgente dati](#le-due-modalità-di-sorgente-dati)
5. [Installazione](#installazione)
6. [Variabili d'ambiente](#variabili-dambiente)
7. [Endpoint HTTP](#endpoint-http)
8. [Comandi e test](#comandi-e-test)
9. [Manutenzione e regole di rilascio](#manutenzione-e-regole-di-rilascio)
10. [Problemi noti e limiti](#problemi-noti-e-limiti)
11. [Prossime modifiche](#prossime-modifiche)
12. [Struttura del repository](#struttura-del-repository)

---

## Cosa fa

L'app **Sofa Time** (iOS/Android) tiene la lista di film e serie "da guardare", ma
non parla con Stremio. Questo addon fa da ponte: legge il backup esportato da Sofa
Time (o si collega a Simkl) e pubblica quelle liste come **cataloghi Stremio**
navigabili dalla TV, dal telefono o dal browser.

In più arricchisce ogni titolo con i metadati di **TMDB** (poster, titolo italiano,
anno, voto, backdrop, generi), con fallback su **Cinemeta** quando TMDB non ha il
dato o la chiave non è configurata.

## Come funziona (architettura)

```
        Sofa Time (telefono)
                │
                │  backup .json / .sofa3bk / .zip
                ▼
   ┌────────────────────────────┐        ┌──────────────┐
   │  sofatimeParser.js         │        │  Simkl API   │  (modalità Live Sync)
   │  normalizza film + serie   │        └──────┬───────┘
   └────────────┬───────────────┘               │
                ▼                               ▼
   ┌──────────────────────────────────────────────────┐
   │  index.js                                        │
   │  · cache backup in memoria + cache_data.json     │
   │  · enrich() → TMDB → fallback Cinemeta           │
   │  · buildCatalog() / buildRandom()                │
   │  · addonBuilder (stremio-addon-sdk)              │
   │  · Express: /upload, /backup-*, /sofatime-status │
   └────────────────────┬─────────────────────────────┘
                        ▼
                 Stremio / Nuvio
```

Punti chiave del funzionamento:

- **Nessun database.** Lo stato vive in tre posti: il file di backup su disco
  (`sofatime_backup.json`), la cache metadati su disco (`cache_data.json`, TTL
  **24 ore**, versione schema `META_CACHE_VER = 2`) e la cache del backup in
  memoria.
- **Il backup da URL viene ri-scaricato** ogni `BACKUP_REFRESH_MIN` minuti
  (default 30). Il backup caricato via `/upload` resta **solo in memoria**: si
  perde al riavvio, a meno che non sia configurato il Gist.
- **`enrich()`** risolve gli id (`tt…` IMDb / `tmdb:…`) e compone il `meta`
  Stremio; `prefetchMeta()` precarica i metadati in background per non far
  aspettare il primo scroll.
- **Lo scrobbler** (`scrobbler.js`) legge la libreria Stremio via
  `api.strem.io` e riporta i "visti" su Simkl. Si attiva solo se
  `STREMIO_EMAIL`/`STREMIO_PASSWORD` (o `STREMIO_AUTHKEY`) sono impostate.
- **Il token Simkl** è salvato in `simkl_token.json` e può essere **cifrato a
  riposo** impostando `TOKEN_ENC_KEY` (formato `enc:v1:`; il vecchio formato in
  chiaro resta leggibile per compatibilità).

## Cataloghi esposti

Il manifest dichiara `resources: ['catalog']` e **quattro voci di catalogo**, che
in Stremio si presentano come due nomi × due tipi (film e serie):

| Nome mostrato | id | Tipo | Cosa contiene |
|---|---|---|---|
| **Da guardare** | `sofatime-movies` | movie | La watchlist "da vedere" importata da Sofa Time |
| **Da guardare** | `sofatime-series` | series | Idem, per le serie TV |
| **Cosa guardare?** | `sofatime-movies-random` | movie | Selezione casuale dalla watchlist, per scegliere al volo |
| **Cosa guardare?** | `sofatime-series-random` | series | Idem, per le serie TV |

Tutti supportano i parametri extra `skip` (paginazione) e `genre` (filtro per
genere, con liste separate per film e serie).

> ⚠️ I due tasti stream "🗑️ Rimuovi / ✅ Segna come visto" sono stati **rimossi**
> (PR #1) e non vanno reintrodotti: un test (`test/manifest.test.js`) fallisce se
> `manifest.resources` torna a contenere `stream`.

## Le due modalità di sorgente dati

### 1. Modalità Backup File — offline, nativa al 100%

Esporta il backup dall'app: **Impostazioni → Gestione Dati → Backup manuale / Esporta**.

Poi scegli una delle tre strade:

| Strada | Come |
|---|---|
| **File locale** | Salva il file come `sofatime_backup.json` nella cartella dell'addon, o imposta `SOFATIME_BACKUP_PATH=/percorso/al/file.json` |
| **URL / Gist remoto** | Carica il file su un Gist GitHub o un web server e imposta `SOFATIME_BACKUP_URL=https://…` (ha **priorità** sul file locale e si aggiorna da solo) |
| **Pagina di upload** | Apri `/upload` dal telefono e seleziona il file: comodo dall'iPhone, sostituisce il Comando Rapido |

Il parser accetta `.json`, `.sofa3bk` e `.zip` e gestisce sia il formato di backup
Sofa Time sia formati di esportazione generici con liste `watchlist`, `movies`,
`shows`, `history`.

### 2. Modalità Live Sync — via Simkl

1. Nell'app Sofa Time attiva la sincronizzazione con Simkl
   (**Impostazioni → Account / Sync → Simkl**).
2. Registra un'app dev su Simkl e ottieni `SIMKL_CLIENT_ID` e `SIMKL_CLIENT_SECRET`.
3. Ottieni il token utente col **PIN flow** (l'addon lo avvia da solo al primo
   avvio e stampa il codice nei log) e impostalo come `SIMKL_ACCESS_TOKEN`.

Le due modalità **convivono**: se il backup è configurato viene usato quello, Simkl
alimenta la Live Sync e lo scrobbling.

## Installazione

### In locale

```bash
git clone https://github.com/samuelenigro97-prog/Sofatime-Hub.git
cd Sofatime-Hub
npm ci
cp .env.example .env      # compila solo le variabili che ti servono
npm start                 # http://localhost:7780
```

> ⚠️ **Il progetto non usa `dotenv`: il file `.env` NON viene letto in automatico.**
> In locale passa le variabili al processo (`SOFATIME_BACKUP_PATH=… npm start`,
> oppure via `EnvironmentVariables` nel plist del LaunchAgent su macOS). Su Render
> si impostano dalla dashboard, in Docker le legge `env_file`.

Poi in Stremio: **Addons → Aggiungi tramite URL** →
`http://localhost:7780/manifest.json`.

### Con Docker

```bash
docker compose up -d      # legge .env, espone la porta 7780
```

Per usare un backup locale, copia il file come `./sofatime_backup.json` e togli il
commento al blocco `volumes:` in `docker-compose.yml`.

### Su Render (deploy pubblico)

Servizio Web Node, build `npm ci`, start `npm start`. Le variabili si impostano in
**Environment**. Imposta `ADDON_URL` all'indirizzo pubblico del servizio, altrimenti
il logo del manifest punta all'URL sbagliato.

Leggi prima la nota sul **limite di 750 ore/mese** in
[Manutenzione](#manutenzione-e-regole-di-rilascio): è il motivo per cui
`KEEP_ALIVE` è spento di default.

## Variabili d'ambiente

Nessuna è obbligatoria in senso stretto, ma senza almeno una **sorgente watchlist**
i cataloghi restano vuoti.

### Sorgente della watchlist

| Variabile | Default | Descrizione |
|---|---|---|
| `SOFATIME_BACKUP_PATH` | `./sofatime_backup.json` | Percorso locale del file di backup |
| `SOFATIME_BACKUP_URL` | — | Link URL/Gist al backup. **Ha priorità** sul file locale |
| `BACKUP_REFRESH_MIN` | `30` | Minuti tra un refresh automatico da URL e il successivo (`0` disattiva) |

### Live Sync Simkl

| Variabile | Default | Descrizione |
|---|---|---|
| `SIMKL_CLIENT_ID` | — | Client ID dell'app Simkl |
| `SIMKL_CLIENT_SECRET` | — | Client Secret dell'app Simkl |
| `SIMKL_ACCESS_TOKEN` | — | Token utente dal PIN flow. Di fatto **obbligatorio su Render**, dove il disco è effimero |

### Metadati e poster

| Variabile | Default | Descrizione |
|---|---|---|
| `TMDB_KEY` | — | **Consigliata.** Chiave TMDB per poster, titoli italiani, voti. Senza, si usa Cinemeta |
| `RPDB_KEY` | — | Chiave RatingPosterDB per i poster con il badge del voto |

### Scrobbler Stremio

| Variabile | Default | Descrizione |
|---|---|---|
| `STREMIO_EMAIL` | — | Email dell'account Stremio usato dallo scrobbler |
| `STREMIO_PASSWORD` | — | Password dell'account. **Solo env var, mai nel codice** |
| `STREMIO_AUTHKEY` | — | In alternativa a email+password: authKey già ottenuto, evita il login |

### Server e deploy

| Variabile | Default | Descrizione |
|---|---|---|
| `ADDON_URL` | `https://sofa-time-hub.onrender.com` | **Consigliata.** URL pubblico dell'addon, usato nel manifest per il logo |
| `PORT` | `7780` | Porta del server HTTP |
| `KEEP_ALIVE` | `false` | `true` per pingare l'addon ogni 14 min ed evitare il cold-start. **Spento di default**, vedi [Manutenzione](#manutenzione-e-regole-di-rilascio) |
| `RENDER` | *(impostata da Render)* | Non impostarla a mano: l'addon la legge per capire se gira su Render (il keep-alive parte solo lì) |

### Sicurezza e upload

| Variabile | Default | Descrizione |
|---|---|---|
| `TOKEN_ENC_KEY` | — | Cifra il token Simkl a riposo su disco (`simkl_token.json`) |
| `CLEAR_CACHE_TOKEN` | — | Protegge `/clear-cache` e `/backup-refresh`: poi usa `?token=…` |
| `UPLOAD_TOKEN` | — | Protegge l'upload del backup: poi usa `/upload?token=…` |
| `GITHUB_GIST_ID` | — | ID del Gist su cui salvare il backup caricato da `/upload` |
| `GITHUB_GIST_TOKEN` | — | Token GitHub (scope `gist`) per aggiornare quel Gist |

> ⚠️ **Sicurezza:** nessuna credenziale va scritta nel codice. Su Render usa
> *Environment*, in Docker `env_file`, su macOS le `EnvironmentVariables` del
> LaunchAgent.

## Endpoint HTTP

| Metodo | Percorso | A cosa serve |
|---|---|---|
| `GET` | `/manifest.json` | Manifest dell'addon: è **questo** l'URL da incollare in Stremio |
| `GET` | `/catalog/:type/:id.json` | Cataloghi (gestiti da `stremio-addon-sdk`) |
| `GET` | `/sofatime-status` | Diagnostica: versione, cataloghi, se backup/Simkl/keep-alive sono configurati, conteggi in cache |
| `GET` | `/backup-status` | Stato del **download automatico da URL**: ultima fetch, ultimo successo, ultimo errore, conteggi |
| `POST` | `/backup-refresh` | Forza il reload immediato del backup (utile dopo aver aggiornato il Gist). Protetto da `CLEAR_CACHE_TOKEN` |
| `GET` | `/upload` | Paginetta HTML per caricare il backup dal telefono |
| `POST` | `/api/upload-backup` | Riceve il file (max 50 MB) dalla pagina o dal Comando Rapido iOS. Protetto da `UPLOAD_TOKEN` |
| `GET` | `/clear-cache` | Svuota la cache dei metadati. Protetto da `CLEAR_CACHE_TOKEN` |
| `GET` | `/logo.png` | Logo dell'addon |

> ℹ️ **`/backup-status` riporta solo il download da URL.** Con il backup letto da
> file locale mostra `film: 0` anche quando i cataloghi funzionano perfettamente.
> Per verificare davvero i dati, interroga
> `/catalog/movie/sofatime-movies.json`.

## Comandi e test

| Comando | Cosa fa |
|---|---|
| `npm start` | Avvia l'addon |
| `npm run dev` | Avvia con `node --watch` (riavvio automatico a ogni salvataggio) |
| `npm run check` | Solo controllo sintattico di `index.js` |
| `npm test` | Controllo sintattico + le tre suite di test |

La suite conta **16 asserzioni**, tutte verdi:

| File | Asserzioni | Copre |
|---|---|---|
| `test/security.test.js` | 5 | Cifratura/decifratura del token Simkl, rifiuto di un token manomesso, scrittura atomica su file |
| `test/parser.test.js` | 3 | Estrazione id IMDb/TMDB, separazione film/serie, parsing di JSON grezzo |
| `test/manifest.test.js` | 8 | Allineamento versioni, `resources`, tipi, id/nomi dei cataloghi, `skip`+`genre`, `idPrefixes`, conversioni id |

Due di questi test sono **reti di sicurezza contro regressioni già avvenute**:

- `manifest.version` deve combaciare con `package.json` — ha già intercettato un
  disallineamento reale che bloccava gli aggiornamenti;
- `manifest.resources` deve essere solo `['catalog']` — impedisce di
  reintrodurre i tasti stream rimossi.

## Manutenzione e regole di rilascio

### Versione: due punti da tenere allineati

Quando pubblichi una modifica aggiorna il numero **sia** in `package.json` **sia**
in `manifest.version` (dentro `index.js`). Devono combaciare, altrimenti
Stremio/Nuvio non rileva l'aggiornamento. `test/manifest.test.js` lo verifica.

Dopo una modifica al manifest può servire **rimuovere e reinstallare** l'addon in
Stremio per forzarne la rilettura.

### Piano gratuito Render: 750 ore/mese

Un solo servizio acceso 24/7 consuma già ~744 h/mese (24 × 31), cioè quasi tutto il
limite gratuito — che è **condiviso su tutto il workspace**, non per singolo
servizio. Per questo `KEEP_ALIVE` è **spento di default**: l'addon si addormenta
quando non lo usi (la prima richiesta dopo l'inattività può metterci 30–60 s in
più) ma non rischi la sospensione.

**Non riattivarlo su piano gratuito**: è esattamente ciò che ha già causato una
sospensione (vedi `docs/STATO_LAVORI.md` §3). Ha senso solo su un piano senza
limite di ore. Non tenere più servizi 24/7 sullo stesso account.

### Rilascio

Checklist completa in **[docs/RELEASE.md](docs/RELEASE.md)**. In sintesi:
`npm ci` → `npm test` → allinea le versioni → verifica `/manifest.json` e
`/sofatime-status` → tag semver → GitHub Release con la sezione corrispondente del
`CHANGELOG.md`.

## Problemi noti e limiti

- **Il file `.env` non viene letto** (manca `dotenv`): vedi
  [Installazione](#in-locale).
- **`npm install` può installare una versione sbagliata di
  `stremio-addon-sdk`** (quella vecchia con `function Addon`), producendo
  `addonBuilder is not a constructor`. Rimedio verificato:
  `npm pack stremio-addon-sdk@1.6.10` e poi `npm install /percorso/al/tgz`.
  Usare `npm ci` invece di `npm install` evita il problema.
- **Il backup caricato via `/upload` vive solo in memoria**: si perde al riavvio.
  A renderlo persistente è il file su disco o il Gist.
- **`web.stremio.com` e Stremio Manager non raggiungono indirizzi `http://`
  locali** (mixed content): serve un tunnel HTTPS.
- **Handler `meta` assente per scelta**: darebbe meno dati di Cinemeta sui film
  (niente cast, durata, trailer) e per le serie richiederebbe la lista episodi.

## Prossime modifiche

Ordine di priorità. Il dettaglio operativo — con comandi e contesto — è in
**[docs/STATO_LAVORI.md](docs/STATO_LAVORI.md)**.

| # | Intervento | Priorità | Nota |
|---|---|---|---|
| 1 | **Ruotare la password dell'account Stremio** | 🔴 Sicurezza | Era hardcoded in `index.js` ed è **ancora nella cronologia git**. Rimuoverla dal codice (PR #3) non basta: finché non viene cambiata va considerata compromessa |
| 2 | **Rientro su Render dal 1° settembre 2026** | 🟠 Infrastruttura | Verificare il manifest online, rifare un upload del backup (su Render è fermo a metà agosto), aggiornare l'URL in Stremio, spegnere i LaunchAgent locali |
| 3 | **Chiudere il problema cataloghi non visibili in Stremio** | 🟠 Aperto | Lato server è tutto verificato e funzionante: resta da controllare quale URL è davvero installato nel client |
| 4 | **Supporto `dotenv`** | 🟡 Comodità | Farebbe leggere il `.env` anche in locale, eliminando le variabili nel plist |
| 5 | **`SOFATIME_BACKUP_URL` puntata al Gist** | 🟡 Comodità | I cataloghi si aggiornerebbero da soli ogni 30 minuti, senza upload manuali |
| 6 | **Nuovo catalogo "Visti di recente"** e ordinamenti per anno/voto | 🟢 Idea | Da concordare prima di implementare |
| 7 | **Workflow CI GitHub Actions** | 🟢 Idea | `test.yml` su Node 18 e 20; richiede il permesso `workflow` sul token |

## Struttura del repository

```
Sofatime-Hub/
├── index.js              # server Express + addonBuilder + cataloghi + enrich TMDB (781 righe)
├── sofatimeParser.js     # parser dei backup Sofa Time (.json/.sofa3bk/.zip)
├── scrobbler.js          # sincronizza i "visti" da Stremio verso Simkl
├── test/
│   ├── security.test.js  # cifratura token, scrittura atomica
│   ├── parser.test.js    # estrazione id, separazione film/serie
│   └── manifest.test.js  # coerenza manifest ↔ package.json
├── docs/
│   ├── STATO_LAVORI.md   # 📌 handoff: stato, infrastruttura, prossimi passi
│   └── RELEASE.md        # checklist di rilascio manuale
├── Dockerfile · docker-compose.yml · .dockerignore
├── .env.example          # tutte le variabili, commentate
├── CHANGELOG.md · LICENSE.md · README.md
└── logo.png
```

File **generati a runtime** e non versionati: `sofatime_backup.json` (il backup),
`cache_data.json` (cache metadati), `simkl_token.json` (token Simkl).

---

Licenza [MIT](LICENSE.md).
