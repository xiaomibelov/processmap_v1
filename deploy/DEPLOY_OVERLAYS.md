# Deploy Overlays

This repository now separates deployment into:

- common baseline
- prod app overlay
- stage app overlay
- shared public edge overlay

## Common baseline

Canonical common files:

- `docker-compose.yml`
- `frontend/Dockerfile`
- `deploy/nginx/default.conf`

Common rules:

- static frontend serving only
- no Vite dev runtime
- no domain-specific nginx behavior
- no TLS cert paths
- `/api/` proxies to `api:8000`
- `/` serves SPA assets with `try_files ... /index.html`

## Same-server topology

Compose project names:

- `processmap_prod`
- `processmap_stage`
- `processmap_edge`

Shared Docker network:

- `processmap_edge_net` (external)

Public edge:

- owns host ports `80/443`
- routes `processmap.ru` to `prod-gateway`
- routes `stage.processmap.ru` to `stage-gateway`

App isolation:

- prod DB: `runtime/prod/postgres`
- stage DB: `runtime/stage/postgres`
- prod workspace: `runtime/prod/workspace`
- stage workspace: `runtime/stage/workspace`
- prod and stage each run their own `postgres`, `redis`, `api`, `gateway`
- prod and stage gateways publish only to loopback and also join `processmap_edge_net`

## Overlay files

Prod app overlay:

- `docker-compose.prod.yml`
- `.env.prod.example`
- `deploy/scripts/deploy_prod.sh`
- `deploy/scripts/smoke_prod.sh`
- `deploy/scripts/rollback_prod.sh`

Stage app overlay:

- `docker-compose.stage.yml`
- `.env.stage.example`
- `deploy/scripts/deploy_stage.sh`
- `deploy/scripts/smoke_stage.sh`
- `deploy/scripts/rollback_stage.sh`

Shared edge overlay:

- `docker-compose.edge.yml`
- `.env.edge.example`
- `deploy/edge/nginx/conf.d/processmap.ru.conf`
- `deploy/edge/nginx/conf.d/stage.processmap.ru.conf`
- `deploy/scripts/deploy_edge.sh`
- `deploy/scripts/smoke_edge.sh`
- `deploy/scripts/rollback_edge.sh`

## SSL / renewal model

Target model:

- webroot-based ACME challenge handling via shared edge nginx
- cert material mounted from host `/etc/letsencrypt`
- ACME webroot served from `./runtime/edge/acme`
- renewal handled by `certbot renew --webroot`

Legacy model:

- standalone renewal is considered legacy
- it must be migrated before final prod+stage shared-edge rollout
- renewal must not require stopping prod

## Expected rollout order

1. Deploy prod app overlay on loopback-only ports.
2. Deploy shared edge overlay for prod using the existing prod certificate.
3. Migrate prod renewal from standalone to webroot.
4. Deploy stage app overlay on isolated loopback-only ports.
5. Issue stage certificate through shared edge webroot flow.
6. Enable stage edge vhost.
7. Smoke stage publicly.
