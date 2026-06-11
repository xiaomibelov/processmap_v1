# ProcessMap Overlay Cache — Deploy Runbook

## 1. Pre-deploy Checklist

| # | Check | Verify Command |
|---|-------|--------------|
| 1 | Redis flags: `--maxmemory 512mb --maxmemory-policy allkeys-lru` | `docker compose config | grep maxmemory` |
| 2 | requirements.txt pinned: `redis>=5.0`, `zstandard>=0.22`, `pybreaker>=1.2`, `celery>=5.3` | `grep -E "redis|zstandard|pybreaker|celery" backend/requirements.txt` |
| 3 | Celery worker command: `celery -A backend.app.celery_app worker -l info -c 4` | `docker compose config | grep celery` |
| 4 | No ThreadPoolExecutor in overlay path | `grep -c ThreadPoolExecutor backend/app/overlay_cache.py` → `0` |
| 5 | GET `/api/sessions/{sid}/bpmn` handles 200/202/503 | `grep -E "result.status == (200\|202\|503)" backend/app/_legacy_main.py` |
| 6 | PUT post-save calls `invalidate_overlay` | `grep "invalidate_overlay(session_id)" backend/app/_legacy_main.py` |
| 7 | Tests pass | `pytest backend/tests/test_overlay_cache.py -v` → `6 passed` |
| 8 | Metrics & health wired | `grep -c "health/overlay-cache" backend/app/routers/system.py` → `1` |
| 9 | Env vars set | `.env` contains `REDIS_URL`, `DATABASE_URL` |

## 2. Canary Deployment Steps

**Step 1** — Deploy canary to 1 instance. Traffic: 0% canary / 100% stable.
**Step 2** — Route 5% traffic to canary. Monitor 5 min.
**Step 3** — Validate thresholds:
  - p95 hit < 15 ms
  - p95 miss < 150 ms
  - HTTP 202 rate < 10%
  - Celery queue length < 5
  - Redis `used_memory` < 60% of 512 MB

**Step 4** — All green → route 50% traffic. Monitor 5 min. Repeat thresholds.
**Step 5** — All green → route 100% traffic. Monitor 10 min.
**Step 6** — Any red → execute rollback (Section 3).

## 3. Rollback Triggers & Procedure

**Auto/manual rollback if ANY of:**
- p95 hit > 30 ms for > 2 min
- HTTP 503 rate > 1% for > 1 min
- Celery queue > 20 for > 3 min
- Redis `used_memory` > 450 MB (90% of 512)
- Postgres connection pool saturation > 80%
- `render_overlay_task` error rate > 5%

**Rollback actions (order matters):**
1. Route 0% traffic to canary.
2. `docker compose stop celery-worker` (new image).
3. Revert `_legacy_main.py` and `overlay_cache.py` to pre-cache tag.
4. `docker compose up -d --build api` on stable image.
5. Redis: `FLUSHDB` **only** if key corruption suspected; else leave.
6. Alert incident channel with canary instance ID and violating metric.

## 4. Post-deploy Verification (First 30 min)

Query every 5 min:

| Metric | Target | Action if violated |
|--------|--------|-------------------|
| `overlay_cache_hit_total{status="200"} / total` | > 70% | Page on-call after 2 consecutive fails |
| `overlay_cache_latency_seconds` p95 | < 15 ms | Page on-call after 2 consecutive fails |
| `celery_queue_length` | = 0 (steady state) | Page on-call after 2 consecutive fails |
| `redis_evicted_keys_total` rate | = 0 | Page on-call after 2 consecutive fails |
| `circuit_breaker_state` | 0 (closed) | Page on-call after 2 consecutive fails |

If any metric violates for **2 consecutive checks** → page on-call immediately.
