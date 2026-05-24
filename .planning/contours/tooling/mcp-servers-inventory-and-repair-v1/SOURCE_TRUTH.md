# Source Truth — tooling/mcp-servers-inventory-and-repair-v1

## Host
- Hostname: `clearvestnic.ru`
- OS: Ubuntu 24.04.3 LTS
- User: root
- Node: v18.19.1 / NPM 9.2.0
- Python: 3.12.3 / uv 0.11.14
- Docker: 29.2.1

## Repo
- Path: `/opt/processmap-test`
- Remote: `https://github.com/xiaomibelov/processmap_v1.git`
- Branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c`
- Status: dirty (`.env` modified, `.env.backup_*`, `TEST_RUNTIME.md`, `bin/` untracked)

## ProcessMap Test Runtime
- Compose project: `processmap_test`
- Services: postgres (healthy), redis (healthy), api (Up), frontend (Up), gateway (Up)
- Ports: API 8088, Gateway 5180, Postgres 5433, Redis 6380
- Health: HTTP 200 on `/health`
