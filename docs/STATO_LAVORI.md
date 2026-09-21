# Stato lavori — handoff

> Documento di passaggio di consegne. Aggiornato al **21 settembre 2026**.
> Scopo: permettere a chiunque (persona o assistente AI) di riprendere il lavoro
> senza dover ricostruire il contesto. Aggiornare questo file quando cambia qualcosa
> di rilevante.

## Situazione in una riga

**Render è tornato attivo** (la sospensione di agosto è rientrata il 1° settembre),
l'addon gira lì alla versione **0.8.2**, i cataloghi sono corretti (741 film, 149 serie).
La soluzione ponte sul Mac non serve più. Resta da rimettere l'indirizzo Render nel
Comando Rapido iOS — vedi §5.

---

## 1. Cos'è il progetto

Addon Stremio/Nuvio che espone la watchlist dell'app **Sofa Time (TVSofa)** come
cataloghi Stremio. Server Node.js (Express + `stremio-addon-sdk`), nessun database:
i dati arrivano da un file di backup esportato dall'app.

Cataloghi esposti (nomi allineati all'app originale):

| Catalogo | Tipi | Note |
|---|---|---|
| **Da guardare** | Film + Serie | La watchlist importata |
| **Cosa guardare?** | Film + Serie | Selezione casuale dalla watchlist |

---

## 2. Lavoro completato (PR unite su `main`)

| PR | Contenuto |
|---|---|
| #1 | Rimossi i due tasti stream "Sofa Time HUB" (🗑️ Rimuovi / ✅ Segna come visto): tolto `stream` da `manifest.resources`. Sbloccato l'aggiornamento del manifest (la versione era congelata a `0.6.0`, quindi Stremio non rilevava mai gli update). |
| #2 | Rimossa `MDBLIST_KEY` (codice morto). README aggiornato. Aggiunto `test/manifest.test.js` (8 asserzioni). |
| #3 | **Sicurezza**: credenziali Stremio spostate fuori dal codice (solo env var), rimossa la route `/api/debug`, upload protetto opzionalmente da `UPLOAD_TOKEN`. |
| #4 | Aggiunto `.env.example`, ripulito `.gitignore`. |
| #8 | `KEEP_ALIVE` disattivato di default (vedi §4). Allineate `package.json` e `manifest.version` a `0.8.0`. |
| #9 | Aggiunto questo documento di handoff. |
| #10 | **v0.8.2**: esclusi dal catalogo i titoli già visti (`isWatchlistFile`), vedi §5. Aggiunta la CI che esegue i test. |

Suite test: **18 asserzioni** (`npm test`) → sicurezza token (5), parser (3), manifest (10).
Girano automaticamente a ogni push e pull request su `main` (`.github/workflows/test.yml`).

Quattro test agiscono da rete di sicurezza contro regressioni già avvenute in passato:
- `manifest.version` deve combaciare con `package.json` (ha già intercettato un disallineamento reale);
- `manifest.resources` deve essere solo `['catalog']` (impedisce di reintrodurre i tasti rimossi);
- `isWatchlistFile()` deve escludere i file `watched*`/`stopWatching*` (due test, impediscono il ritorno dei titoli già visti nel catalogo).

---

## 3. Storico infrastruttura (agosto 2026 — risolto)

> Sezione storica, utile se il problema si ripresenta. Per lo stato attuale vedi §5.

### Render: era sospeso fino al 1° settembre 2026

Il workspace Render ha esaurito le **750 ore gratuite mensili**. Causa: due servizi
tenuti svegli 24/7 (`sofa-time-hub` + un secondo progetto `trakt-hub`, ora eliminato).
Un solo servizio 24/7 consuma già ~744h/mese, quindi il margine era nullo.

- `https://sofa-time-hub.onrender.com` → HTTP 503 "Service Suspended"
- Render lo riattiva **automaticamente** all'inizio del mese di calendario successivo
- Non esiste un pulsante di riattivazione gratuito (verificato nella dashboard)

### Soluzione ponte attiva: Mac dell'utente + ngrok

Mentre Render è sospeso, l'addon gira sul Mac dell'utente ed è esposto su internet:

| Componente | Dettaglio |
|---|---|
| Cartella | `~/Sofatime-Hub` |
| Porta locale | `7780` |
| Indirizzo pubblico | `https://trifocals-riches-blast.ngrok-free.dev` (dominio **statico** ngrok free) |
| LaunchAgent server | `com.samuele.sofatime-hub` — log `~/Sofatime-Hub/addon.log` |
| LaunchAgent tunnel | `com.samuele.sofatime-ngrok` — log `~/Sofatime-Hub/ngrok.log` |
| Backup | `~/Sofatime-Hub/sofatime_backup.json` (716 film, 135 serie) |

Entrambi i LaunchAgent hanno `RunAtLoad` + `KeepAlive`: ripartono da soli e non
dipendono da un Terminale aperto. **Requisito: il Mac deve restare acceso e sveglio.**

Il vecchio tunnel Cloudflare è stato dismesso (generava un URL casuale a ogni riavvio,
motivo per cui si è passati a ngrok); il suo plist è archiviato in
`~/Library/LaunchAgents/disabled/`.

#### Note tecniche emerse durante il setup (utili se si ripete l'installazione locale)

1. **`npm install` sul Mac installava una versione errata e antica di
   `stremio-addon-sdk`** (quella con `function Addon` ed `express-handlebars`),
   nonostante il lockfile indicasse `1.6.10` → errore `addonBuilder is not a constructor`.
   Soluzione applicata: installare dal tarball verificato →
   `npm pack stremio-addon-sdk@1.6.10` e poi `npm install /percorso/al/tgz`.
2. **Il progetto non usa `dotenv`**: il file `.env` NON viene letto. Le variabili
   vanno passate al processo (su Render dalla dashboard, in locale via
   `EnvironmentVariables` nel plist del LaunchAgent).
3. **`/backup-status` riporta solo il download automatico da URL**: con il backup
   letto da file locale mostra `film: 0` anche quando i cataloghi funzionano.
   Per verificare davvero, interrogare `/catalog/movie/sofatime-movies.json`.
4. Il backup caricato via `/upload` o Comando Rapido resta **solo in memoria**:
   si perde al riavvio. Il file su disco (`sofatime_backup.json`) è ciò che rende
   i cataloghi persistenti.

---

## 4. `KEEP_ALIVE`: perché è spento

`startKeepAlive()` pingava l'addon ogni 14 minuti per evitare il cold-start su Render,
ma così il servizio non si addormentava mai e consumava l'intero monte ore gratuito.
Ora è dietro la env var `KEEP_ALIVE` (default: **off**).

**Non riattivarlo** su un piano gratuito Render: è ciò che ha causato la sospensione.
Ha senso solo su un piano senza limite di ore.

---

## 5. Stato attuale e cose da sapere

### Render è tornato (dal 1° settembre)

`https://sofa-time-hub.onrender.com` risponde regolarmente, versione **0.8.2**,
dati caricati: **741 film, 149 serie**. La sospensione di agosto è rientrata da sola.

### ⚠️ Da fare: rimettere l'indirizzo Render nel Comando Rapido iOS

Durante l'emergenza il Comando Rapido "SofaTime ➡️ Stremio" era stato puntato prima a
un tunnel Cloudflare e poi al Mac via ngrok. **Quegli indirizzi ora sono morti**, quindi
il comando spedisce nel vuoto. Va rimesso:

```
https://sofa-time-hub.onrender.com/api/upload-backup
```

(Comandi Rapidi → azione **Testo** in cima → sostituire l'URL.)

Nota: il comando funziona **solo dal menu di condivisione** di Sofa Time, non premendo
▶️ dentro l'app Comandi Rapidi (senza file in input restituisce
`{"error":"Formato file non valido o vuoto"}`). La configurazione dell'azione
"Ottieni contenuti di" è corretta: `POST` + `Corpo della richiesta: File` +
`File: Input comando rapido`. In alternativa esiste la pagina `/upload`.

### Regressione risolta: titoli già visti nel catalogo (v0.8.2)

Il commit `40c082b` (v0.8.1) aveva sostituito il filtro sui nomi dei file dello zip
("solo `watchlist`") con "tutti i `.json`", facendo entrare nel catalogo anche
`watchedMovie`/`watchedShow`: i titoli già finiti comparivano tra quelli da guardare.

**Dato fondamentale da ricordare:** gli elementi di `watchlist*` e `watched*` hanno
campi **identici** (`addedDate`, `genres`, `imdb`, `release_date`, `runtime`, `title`,
`tmdb`, `type`). Non esiste nessun campo "visto": **il nome del file è l'unica
informazione disponibile**. Per questo esiste `isWatchlistFile()` in `index.js` —
non rimuoverla e non allargarla ai file `watched*`/`stopWatching*`.

Struttura di un backup Sofa Time:

| File | Contenuto | Nel catalogo? |
|---|---|---|
| `watchlistMovie` / `watchlistShow` | Da vedere | ✅ sì |
| `watchedMovie` / `watchedShow` | Già visti | ❌ no |
| `stopWatchingMovie` / `stopWatchingShow` | Abbandonati | ❌ no |
| `<nome>__listid_<id>` | Liste personalizzate | ✅ sì |

### Il Mac non serve più

I due LaunchAgent (`com.samuele.sofatime-hub`, `com.samuele.sofatime-ngrok`) possono
essere disattivati:

```bash
launchctl unload -w ~/Library/LaunchAgents/com.samuele.sofatime-hub.plist
launchctl unload -w ~/Library/LaunchAgents/com.samuele.sofatime-ngrok.plist
```

Restano comunque pronti come piano B in caso di futuri problemi con Render.

---

## 6. Prossimi passi

### A. Il 1° settembre 2026 — rientro su Render

1. Verificare che `https://sofa-time-hub.onrender.com/manifest.json` risponda col JSON.
2. Rimettere l'URL Render nel Comando Rapido iOS:
   `https://sofa-time-hub.onrender.com/api/upload-backup`.
3. Eseguirlo una volta: su Render la watchlist è ferma a metà agosto, perché in queste
   settimane gli upload sono andati solo al Mac (che non ha le credenziali del Gist).
4. In Stremio sostituire l'addon con quello Render.
5. Spegnere i servizi locali:
   ```bash
   launchctl unload -w ~/Library/LaunchAgents/com.samuele.sofatime-hub.plist
   launchctl unload -w ~/Library/LaunchAgents/com.samuele.sofatime-ngrok.plist
   ```

Con `KEEP_ALIVE` spento e `trakt-hub` eliminato, Render non dovrebbe più sospendersi.

### B. Sicurezza — da fare, non ancora risolto

⚠️ La password dell'account Stremio usata dallo scrobbler era hardcoded in `index.js`
ed **è tuttora presente nella cronologia git**. La PR #3 l'ha rimossa dal codice
corrente, ma questo non basta: **la password va cambiata** e reimpostata solo come
variabile d'ambiente (`STREMIO_EMAIL`, `STREMIO_PASSWORD`). Finché non viene ruotata,
va considerata compromessa.

### C. Migliorie possibili (nessuna urgente, da concordare con l'utente)

- **Supporto `dotenv`**: farebbe leggere il file `.env` anche in locale, eliminando
  la necessità di mettere le variabili nel plist (vedi §3, nota 2).
- **`SOFATIME_BACKUP_URL`**: se impostata al Gist, i cataloghi si aggiornano da soli
  ogni 30 minuti. Il valore è nelle env var del servizio su Render (non recuperato
  in questa sessione perché l'accesso alla dashboard è solo dell'utente).
- **Nuovo catalogo "Visti di recente"**, ordinamenti alternativi (per anno/voto).
- **Handler `meta`**: valutato e **sconsigliato** — su film darebbe meno dati di
  Cinemeta (niente cast, durata, trailer) e per le serie servirebbe la lista episodi.

---

## 7. Convenzioni di lavoro

- Sviluppo sul branch `claude/remove-sofa-time-buttons-at7zav`, poi PR verso `main`
  (squash merge). Render pubblica automaticamente da `main`.
- **Quando si cambia il codice, aggiornare la versione in `package.json` E in
  `manifest.version` (`index.js`): devono combaciare.** Stremio rileva un
  aggiornamento solo se il numero di versione cambia. Un test lo verifica.
- Dopo una modifica al manifest può servire rimuovere e reinstallare l'addon in
  Stremio/Nuvio per forzarne la rilettura.
- Eseguire `npm test` prima di ogni commit.
