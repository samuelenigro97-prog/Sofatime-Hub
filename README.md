# SofaTime Hub

Addon Stremio/Nuvio che trasforma il backup di Sofa Time (TVSofa) in cataloghi personali.

## Funzioni

- Import di backup `.json`, `.sofa3bk` e `.zip`, da file locale o URL remoto.
- Cataloghi film e serie “Da guardare” e “Cosa guardare?”.
- Metadati italiani, poster e valutazioni tramite TMDB, Cinemeta e RPDB.
- Refresh automatico del backup remoto e pagina protetta `/upload`.

## Avvio

```bash
npm ci
cp .env.example .env
npm start
```

Esporta il backup da Sofa Time e salvalo come `sofatime_backup.json`, oppure configura `SOFATIME_BACKUP_URL`. Il manifest è disponibile su `http://localhost:7780/manifest.json`.

## Configurazione

| Variabile | Uso |
| --- | --- |
| `SOFATIME_BACKUP_PATH` | Percorso del backup locale. |
| `SOFATIME_BACKUP_URL` | URL/Gist del backup; ha priorità sul file locale. |
| `BACKUP_REFRESH_MIN` | Intervallo di refresh; `0` lo disabilita. |
| `TMDB_KEY` | Chiave TMDB per metadati italiani. |
| `RPDB_KEY` | Chiave RatingPosterDB opzionale. |
| `ADDON_URL` | URL pubblico dell'addon. |
| `PORT` | Porta HTTP, predefinita `7780`. |
| `UPLOAD_TOKEN` | Obbligatorio per caricare backup da `/upload`. |
| `CLEAR_CACHE_TOKEN` | Obbligatorio per refresh e pulizia cache. |
| `GITHUB_GIST_ID` / `GITHUB_GIST_TOKEN` | Salvataggio opzionale del backup caricato su Gist. |

I token amministrativi viaggiano nell'header `Authorization: Bearer ...`, non nella URL. Se un token non è configurato, il relativo endpoint resta disabilitato.

## Comandi amministrativi

```bash
curl -X POST -H "Authorization: Bearer $CLEAR_CACHE_TOKEN" "$ADDON_URL/backup-refresh"
curl -X POST -H "Authorization: Bearer $CLEAR_CACHE_TOKEN" "$ADDON_URL/clear-cache"
```

## Qualità e rilascio

- `npm test` controlla sintassi, parser, sicurezza e manifest.
- GitHub Actions esegue test e audit delle dipendenze su ogni push e pull request.
- La versione di `package.json` deve coincidere con `manifest.version`; il test blocca i disallineamenti.
- Creare una release GitHub con changelog per ogni versione distribuita.

Non committare `.env`, backup, cache o token reali.
