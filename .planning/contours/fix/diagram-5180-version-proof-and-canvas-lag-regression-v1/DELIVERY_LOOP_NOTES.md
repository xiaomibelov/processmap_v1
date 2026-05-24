# DELIVERY_LOOP_NOTES.md

## Before (Inferred)

1. `npm run build` → `frontend/dist/`
2. `docker cp frontend/dist/. processmap_test-gateway-1:/usr/share/nginx/html/`
3. Result: stale asset accumulation (40 files in container, 7+ duplicate chunks)

Evidence:
- Container created 2026-05-14T21:57:42Z
- Files inside modified up to 2026-05-15T19:09
- No volume mount for `/usr/share/nginx/html`

## After (Fixed)

1. `npm run build` → `frontend/dist/`
2. Gateway serves directly via bind volume: `./frontend/dist:/usr/share/nginx/html:ro`
3. No `docker cp` needed
4. No stale asset accumulation
5. Container restart NOT required after build

## docker-compose.yml Change

```yaml
gateway:
  volumes:
    - ./deploy/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    - ./frontend/dist:/usr/share/nginx/html:ro   # <-- added
```

## Commands Used

```bash
# Rebuild frontend
PROCESSMAP_CONTOUR_ID="fix/diagram-5180-version-proof-and-canvas-lag-regression-v1" npm run build

# Recreate gateway with bind volume
docker stop processmap_test-gateway-1
docker rm processmap_test-gateway-1
docker compose -p processmap_test up -d --no-deps gateway
```

## Container IDs

| Time | Container | Image |
|------|-----------|-------|
| Before | `processmap_test-gateway-1` (created May 14) | `sha256:058a5082ef6eeb01d4d04d628b7558a59eae77e66295e05df371f26d63115c3a` |
| After | `processmap_test-gateway-1` (recreated May 15 ~19:48) | same image, bind volume mount |
