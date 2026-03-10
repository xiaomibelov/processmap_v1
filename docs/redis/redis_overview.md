# Redis Runtime Policy

## Goal

Run Redis as the default performance layer (locks/cache/jobs), and use fallback mode only on real Redis failure.

## Runtime contract

- `REDIS_URL` defines Redis connection (compose default: `redis://redis:6379/0`).
- `REDIS_REQUIRED=1` keeps Redis-first semantics enabled by default.
- Backend helper: `backend/app/redis_client.py`.
- `runtime_status()` returns explicit state:
  - `ON / healthy` (normal preferred path)
  - `FALLBACK / fallback_unavailable` (degraded)
  - `ERROR / misconfigured` (incident)
- Backend remains no-op safe: if Redis is unavailable, requests continue in fallback mode, but status is not treated as normal.

## Local infrastructure

`docker-compose.yml` includes service `redis`:

- Image: `redis:7.2-alpine`
- Healthcheck: `redis-cli ping`
- No project data volume changes.

Minimal run:

```bash
docker compose up -d redis api
docker compose ps redis
```

Minimal backend smoke (healthy path):

```bash
REDIS_URL=redis://localhost:6379/0 REDIS_REQUIRED=1 python -c "from backend.app.redis_client import runtime_status; print(runtime_status())"
```
