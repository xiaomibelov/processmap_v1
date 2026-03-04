# Redis Bootstrap (P0)

## Goal

Add Redis as optional infrastructure without changing product logic.

## Runtime contract

- `REDIS_URL` controls Redis activation.
- Backend helper: `backend/app/redis_client.py`.
- `get_client()` returns:
  - Redis client, when URL + package + connection are available.
  - `None`, when Redis is disabled or unavailable.
- `ping()` returns:
  - `True`, when Redis responds.
  - `False`, on disabled/unavailable/error.

The module is no-op safe by design: Redis issues log warnings but do not crash app startup or requests.

## Local infrastructure

`docker-compose.yml` includes service `redis`:

- Image: `redis:7.2-alpine`
- Healthcheck: `redis-cli ping`
- No project data volume changes.

Minimal run:

```bash
docker compose up -d redis
docker compose ps redis
```

Minimal backend smoke:

```bash
REDIS_URL=redis://localhost:6379/0 python -c "from backend.app.redis_client import get_client,ping; print('client=', bool(get_client())); print('ping=', ping())"
```

