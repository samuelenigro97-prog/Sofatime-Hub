# Sofa Time HUB

Addon esistente per portare la watchlist Sofa Time in Stremio/Nuvio e conservare in un unico archivio lo stato di visione proveniente dalle due piattaforme.

## Sincronizzazione diretta

Non sono necessari account o API di servizi esterni.

- **Stremio → Hub:** il server legge periodicamente gli elementi visti dal datastore Stremio e li salva nell'archivio del Hub.
- **Nuvio → Hub:** il client invia avanzamento e completamento a `POST /api/scrobble`.
- **Hub → Nuvio:** il client legge lo stato completo o incrementale da `GET /api/sync`.

Un addon Stremio standard non riceve eventi play/pausa in tempo reale. Dal lato Stremio il sistema può quindi importare gli elementi contrassegnati come visti; il progresso preciso richiederebbe una modifica al client Stremio. Nuvio è open source e può invece integrare direttamente questi due endpoint.

### Scrittura da Nuvio

```http
POST /api/scrobble
Authorization: Bearer <SCROBBLE_TOKEN>
Content-Type: application/json

{
  "action": "pause",
  "progress": 42.5,
  "movie": {
    "title": "Inception",
    "ids": { "imdb": "tt1375666", "tmdb": 27205 }
  }
}
```

Per un episodio usare `episode` con `ids`, `season` e `number`. Le azioni ammesse sono `start`, `pause`, `stop` e `watched`.

### Lettura da Nuvio

```http
GET /api/sync?since=2026-08-12T00:00:00.000Z
Authorization: Bearer <SCROBBLE_TOKEN>
```

Senza `since` viene restituito lo stato completo. Con `since` vengono restituiti solo gli elementi modificati dopo quell'istante.

## Configurazione Render

| Variabile | Uso |
|---|---|
| `SCROBBLE_TOKEN` | Segreto condiviso che protegge scrittura e lettura sync |
| `STREMIO_AUTHKEY` | Metodo consigliato per leggere la cronologia Stremio senza salvare la password |
| `STREMIO_EMAIL` / `STREMIO_PASSWORD` | Fallback al posto di `STREMIO_AUTHKEY` |
| `HUB_STATE_FILE` | Percorso del file persistente, consigliato `/var/data/watch_state.json` |
| `SOFATIME_BACKUP_URL` | URL del backup Sofa Time aggiornato automaticamente |
| `SOFATIME_BACKUP_PATH` | Percorso locale alternativo del backup |
| `UPLOAD_TOKEN` | Protegge il caricamento manuale del backup |

Su Render va collegato un Persistent Disk montato in `/var/data`; senza disco i dati salvati localmente possono sparire a un riavvio o deploy.

## Avvio e verifica

```bash
npm install
npm test
npm start
```

- Manifest: `/manifest.json`
- Stato servizio: `/sofatime-status`
- Caricamento backup: `/upload`
- Versione in `package.json` e `manifest.version` deve sempre coincidere.

Non inserire credenziali o token nel repository: configurarli esclusivamente come variabili d'ambiente.
