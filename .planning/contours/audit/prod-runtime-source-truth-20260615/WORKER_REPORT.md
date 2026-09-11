# WORKER REPORT — Prod runtime/source truth alignment

**Contour:** `audit/prod-runtime-source-truth-20260615`
**Executor:** Kimi CLI
**Completed:** 2026-06-15

## Task
Align git truth with the running ProcessMap production deployment at `http://clearvestnic.ru:5177`.

## 5-plane proof

| Plane | Intended | Served | Match |
|-------|----------|--------|-------|
| code | `38d4b366` on `origin/main` | `38d4b366` pushed to `new-origin/main` | ✅ |
| workspace | `/root/processmap_v1` | `/root/processmap_v1` used by deploy script | ✅ |
| DB | `processmap` on `processmap_v1-postgres-1` | same, 7 connections healthy | ✅ |
| env/compose | `docker compose` from `/root/processmap_v1` | `./deploy/deploy.sh` executed from `/root/processmap_v1` | ✅ |
| serving mode | `38d4b366` on `:5177` and `:8011` | `/version` returns `38d4b366` on both ports | ✅ |

## Commands executed
```bash
cd /root/processmap_v1
git fetch new-origin main
git merge new-origin/main -m "merge: integrate main PR #388 with local auth fix"
git push new-origin HEAD:main
./deploy/deploy.sh
```

## Output summary
- Merge commit: `38d4b366`
- Push: `24c529c6..38d4b366  HEAD -> main`
- Deploy: images rebuilt, old containers deprecated, new containers started, healthcheck passed.

## Verification commands
```bash
curl -s http://clearvestnic.ru:5177/version
curl -s http://clearvestnic.ru:8011/version
docker ps --filter "name=processmap_v1" --format "table {{.Names}}\t{{.Status}}"
```

## Known artifacts
- `build-info.json` still shows `8fa9c6b7`; actual runtime build ID is `38d4b366`.
