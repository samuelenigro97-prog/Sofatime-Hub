# Changelog

Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).

## [Unreleased]

### Aggiunto
- Licenza MIT (`LICENSE.md`).
- Template GitHub per bug report, feature request e pull request.
- Runbook release manuale in `docs/RELEASE.md`.
- Supporto Docker self-hosted (`Dockerfile`, `.dockerignore`, `docker-compose.yml`).

### Da automatizzare quando il permesso `workflow` sarà attivo
- Workflow CI `test.yml` su main con Node 18 e 20.
- Generazione changelog da commit/PR.
- Release GitHub con artifact addon e immagine Docker.
