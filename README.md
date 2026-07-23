# Simkl Hub

Addon Stremio/Nuvio che porta la tua **watchlist Simkl** ("Da vedere") nei cataloghi,
con bottoni per aggiungere/rimuovere e segnare come visto. Alternativa a Trakt Hub,
pensata per superare i limiti del piano free di Trakt (watchlist 250, 1 sola app).

## Stato

Milestone 1 (questo commit):
- ✅ Auth Simkl (PIN flow) + token cifrato a riposo
- ✅ Cataloghi watchlist (film + serie) con arricchimento TMDB (poster, titolo IT, voto IMDb)
- ✅ Bottoni add / remove / segna-visto (endpoint protetti da bot: conferma + POST via JS + rate limit)
- ✅ Endpoint diagnostico `/simkl-status`

In arrivo (milestone successive, da testare dal vivo):
- Sync bidirezionale con la libreria Stremio (visti Stremio → Simkl e viceversa)
- Cataloghi "In arrivo" e "Scegli per me"

## Cosa serve per farlo girare

### 1. Registra un'app su Simkl
1. Vai su <https://simkl.com/settings/developer/> → **Create new app** (serve un account Simkl).
2. Prendi nota di **Client ID** e **Client Secret**.
3. Come redirect URI va bene `urn:ietf:wg:oauth:2.0:oob` (l'addon usa il PIN flow, non serve un callback web).

### 2. Ottieni un access token (una volta)
In locale, con le env impostate, avvia `npm start`: l'addon stampa un **codice PIN** e l'URL
`https://simkl.com/pin`. Inserisci il codice sul sito col tuo account, e il token viene salvato
(cifrato se `TOKEN_ENC_KEY` è impostata). Copia poi il token in `SIMKL_ACCESS_TOKEN` su Render.

### 3. Variabili d'ambiente
| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `SIMKL_CLIENT_ID` | ✅ | Client ID dell'app Simkl |
| `SIMKL_CLIENT_SECRET` | consigliata | Client Secret (per rinnovo token) |
| `SIMKL_ACCESS_TOKEN` | ✅ su Render | Token utente ottenuto col PIN flow |
| `TMDB_KEY` | ✅ | Chiave TMDB per poster/titoli italiani |
| `ADDON_URL` | ✅ su Render | URL pubblico del servizio (es. `https://simkl-hub.onrender.com`) |
| `STREMIO_AUTHKEY` | opzionale | Per il futuro sync con la libreria Stremio |
| `TOKEN_ENC_KEY` | opzionale | Cifra il token a riposo (consigliata) |

### 4. Deploy
Come Trakt Hub: servizio Node su Render, `npm start`, le env sopra impostate.

## Comandi
- `npm start` — avvia l'addon
- `npm test` — controllo sintassi + test di sicurezza (cifratura token, scritture atomiche)
