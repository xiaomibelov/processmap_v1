#!/usr/bin/env bash
set -u
set -o pipefail

cd "$(git rev-parse --show-toplevel)"

COMPOSE_FILE_PATH=""
for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
  if [ -f "$candidate" ]; then
    COMPOSE_FILE_PATH="$(pwd)/$candidate"
    break
  fi
done
if [ -z "$COMPOSE_FILE_PATH" ] && [ -n "${COMPOSE_FILE:-}" ]; then
  COMPOSE_FILE_PATH="$COMPOSE_FILE"
fi

if ! docker info >/dev/null 2>&1; then
  if command -v open >/dev/null 2>&1; then
    open -a "Docker" >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 90); do
    if docker info >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
fi

echo "== docker versions =="
docker --version || true
docker compose version || true
echo "compose_file=${COMPOSE_FILE_PATH:-not_found}"
echo

echo "== compose services =="
docker compose config --services || true
echo

echo "== compose ports =="
docker compose config --format json >/tmp/fpc_recover_compose_config.json 2>/dev/null || true
python3 - <<'PY'
import json
from pathlib import Path
p = Path("/tmp/fpc_recover_compose_config.json")
if not p.exists():
    print("compose config json unavailable")
    raise SystemExit(0)
try:
    cfg = json.loads(p.read_text())
except Exception:
    print("compose config json parse failed")
    raise SystemExit(0)
services = cfg.get("services", {})
for name, svc in services.items():
    ports = svc.get("ports", [])
    for ent in ports:
        if isinstance(ent, dict):
            host = ent.get("host_ip") or "0.0.0.0"
            pub = ent.get("published")
            tgt = ent.get("target")
            proto = ent.get("protocol", "tcp")
            print(f"{name}: {host}:{pub}->{tgt}/{proto}")
        else:
            print(f"{name}: {ent}")
PY
echo

echo "== compose down (no volumes) =="
docker compose down --remove-orphans || true
echo

echo "== compose pull =="
docker compose pull || true
echo

echo "== compose up -d --build =="
docker compose up -d --build || true
echo

echo "== compose ps =="
docker compose ps || true
echo

echo "== compose logs (tail=200) =="
docker compose logs --tail=200 || true
echo

echo "== health/restart diagnostics =="
docker compose ps --format json >/tmp/fpc_recover_compose_ps.json 2>/dev/null || true
python3 - <<'PY' >/tmp/fpc_recover_problem_services.txt
import json
from pathlib import Path
p = Path("/tmp/fpc_recover_compose_ps.json")
if not p.exists():
    raise SystemExit(0)
try:
    rows = json.loads(p.read_text())
except Exception:
    rows = []
problem = []
for row in rows:
    svc = str(row.get("Service", "")).strip()
    state = str(row.get("State", "")).strip().lower()
    health = str(row.get("Health", "")).strip().lower()
    status = str(row.get("Status", "")).strip().lower()
    if not svc:
      continue
    if state not in {"running"} or ("restart" in status) or (health in {"unhealthy"}):
      problem.append(svc)
for svc in sorted(set(problem)):
    print(svc)
PY

if [ -s /tmp/fpc_recover_problem_services.txt ]; then
  while IFS= read -r svc; do
    [ -z "$svc" ] && continue
    echo "-- problem service: $svc --"
    docker compose logs --tail=200 "$svc" || true
    cid="$(docker compose ps -q "$svc" 2>/dev/null | head -n1)"
    if [ -n "$cid" ]; then
      echo "health inspect for $svc ($cid)"
      docker inspect "$cid" --format '{{json .State.Health}}' || true
    fi
    echo
  done </tmp/fpc_recover_problem_services.txt
else
  echo "no unhealthy/restarting services detected"
fi

