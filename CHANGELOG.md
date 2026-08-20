# Changelog

Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).
Il progetto segue il [versionamento semantico](https://semver.org/lang/it/).

> ⚠️ **Regola del progetto:** a ogni rilascio il numero di versione va aggiornato
> **sia** in `package.json` **sia** in `manifest.version` (`index.js`). Devono
> combaciare, altrimenti Stremio non rileva l'aggiornamento — `test/manifest.test.js`
> lo verifica.

## [Non rilasciato]

### Modificato
- README riscritto come documentazione completa del progetto: architettura,
  tabella dei quattro cataloghi, tutte le variabili d'ambiente (incluse
  `STREMIO_AUTHKEY` e `RENDER`, prima non documentate), tabella degli endpoint
  HTTP, dettaglio delle suite di test, problemi noti e roadmap.
- Changelog riorganizzato con lo storico reale delle versioni 0.6.0 → 0.8.0,
  ricostruito dalle PR unite.

### Da automatizzare quando il permesso `workflow` sarà attivo
- Workflow CI `test.yml` su main con Node 18 e 20.
- Generazione del changelog da commit/PR.
- Release GitHub con artifact addon e immagine Docker.

---

## [0.8.0]

### Modificato
- **`KEEP_ALIVE` disattivato di default.** Il ping ogni 14 minuti teneva il
  servizio sempre sveglio e consumava l'intero monte ore gratuito di Render
  (750 h/mese, condivise su tutto il workspace): è la causa diretta della
  sospensione del servizio. Ora è dietro la variabile `KEEP_ALIVE`, spenta salvo
  richiesta esplicita.
- Allineate `package.json` e `manifest.version` a `0.8.0`.

### Aggiunto
- Supporto Docker self-hosted: `Dockerfile`, `.dockerignore`, `docker-compose.yml`.
- Licenza MIT (`LICENSE.md`).
- Template GitHub per bug report, feature request e pull request.
- Runbook di rilascio manuale in `docs/RELEASE.md`.
- Documento di handoff `docs/STATO_LAVORI.md` con stato, infrastruttura e
  prossimi passi.

## [0.7.x]

### Sicurezza
- **Credenziali Stremio spostate fuori dal codice**: `STREMIO_EMAIL` e
  `STREMIO_PASSWORD` si leggono solo dalle variabili d'ambiente.
  ⚠️ La vecchia password resta nella **cronologia git**: va ruotata (vedi
  `docs/STATO_LAVORI.md` §6-B).
- Rimossa la route `/api/debug`, che esponeva informazioni interne.
- Upload del backup protetto opzionalmente da `UPLOAD_TOKEN`.
- Token Simkl cifrabile a riposo su disco tramite `TOKEN_ENC_KEY`
  (formato `enc:v1:`, con lettura retrocompatibile del formato in chiaro).

### Aggiunto
- `.env.example` con tutte le variabili commentate.
- `test/manifest.test.js` (8 asserzioni), che verifica l'allineamento delle
  versioni e la forma dei cataloghi.

### Rimosso
- `MDBLIST_KEY`: codice morto, mai usato.

### Modificato
- `.gitignore` ripulito.

## [0.6.0]

### Rimosso
- **I due tasti stream "🗑️ Rimuovi" e "✅ Segna come visto"**: tolto `stream`
  da `manifest.resources`. Questo ha anche sbloccato l'aggiornamento del
  manifest, che era congelato a `0.6.0` — Stremio quindi non rilevava mai gli
  update. Un test impedisce ora di reintrodurli per errore.

---

## Storico infrastruttura

Non sono modifiche al codice, ma spiegano scelte visibili nel changelog:

- **Agosto 2026** — il workspace Render esaurisce le 750 h gratuite mensili
  (due servizi tenuti svegli 24/7). Il servizio va in HTTP 503 fino al
  1° settembre 2026. Come ponte, l'addon gira sul Mac dell'utente esposto via
  dominio statico ngrok. Dettagli e procedura di rientro in
  `docs/STATO_LAVORI.md` §3 e §6-A.
