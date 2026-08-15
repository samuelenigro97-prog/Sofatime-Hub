# Release manuale — Sofatime Hub

In attesa di poter automatizzare via GitHub Actions, usa questa checklist.

## Artifact da pubblicare
- sorgente addon compresso, es. `sofatime-hub-vX.Y.Z.zip`
- opzionale: immagine Docker pubblicata su GHCR/Docker Hub
- nota con variabili ambiente nuove o cambiate

## Checklist
1. `npm ci`
2. `npm test`
3. Allinea `package.json` e `manifest.version` in `index.js`.
4. Verifica `/manifest.json` e `/sofatime-status` su una istanza pulita.
5. Se usi Docker: `docker build -t sofatime-hub:vX.Y.Z .`
6. Crea tag semver, es. `v0.8.0`.
7. Crea la GitHub Release dal tag e carica lo zip sorgente.
8. Nel corpo release copia la sezione corrispondente da `CHANGELOG.md`.

## Da automatizzare
Quando il token/integrazione avrà scope `workflow`, creare `.github/workflows/release.yml` con trigger su tag `v*`, test, build zip sorgente, build/push immagine Docker e pubblicazione release.
