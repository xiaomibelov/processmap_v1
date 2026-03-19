# Prod Full-Product Contour

This repository now versions both application contour and serving contour.

## Application contour
- `backend/**`
- `frontend/**` (including `frontend/.npmrc`, `frontend/package-lock.json`, `frontend/Dockerfile`)
- `docker-compose.yml`

## Serving contour
- `Dockerfile.gateway.prod`
- `docker-compose.prod.yml`
- `docker-compose.ssl.yml`
- `docker-compose.prod.gateway.yml`
- `docker-compose.stage.yml`
- `docker-compose.stage.prodlike.yml`
- `deploy/nginx/default.prod.internal.conf`
- `deploy/nginx/default.prod.tls.conf`

## Operational contract intentionally externalized
- TLS material mount path (`LETSENCRYPT_DIR`)
- certbot challenge path (`CERTBOT_WWW_DIR`)
- external edge network (`EDGE_NETWORK_NAME`)
- runtime data truth mounts (`runtime/prod/*`, `runtime/stage/*`)
