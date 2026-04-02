cd "$(git rev-parse --show-toplevel)" || exit 1
set -e

HOST_PORT="$(grep -E '^HOST_PORT=' .env 2>/dev/null | head -n1 | cut -d= -f2)"
if [ -z "$HOST_PORT" ]; then HOST_PORT="8000"; fi
BASE="http://127.0.0.1:${HOST_PORT}"

TAG="cp/fpc_up_and_list_routes_v2_$(date +%F_%H%M%S)"
git tag -a "$TAG" -m "checkpoint: up + list routes v2" >/dev/null 2>&1 || true

echo "BASE=$BASE"
echo "TAG=$TAG"

echo
echo "== docker compose ps =="
docker compose ps || true

echo
echo "== start app =="
docker compose up -d app

echo
echo "== wait /api/meta (up to 30s) =="
OK=0
for i in $(seq 1 30); do
  HTTP="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/meta" || true)"
  if [ "$HTTP" = "200" ]; then
    OK=1
    break
  fi
  sleep 1
done
echo "meta_ready=$OK"

if [ "$OK" != "1" ]; then
  echo
  echo "FAIL: /api/meta not ready"
  echo "== last logs =="
  docker compose logs --tail=120 app | sed -n '1,220p' || true
  echo
  echo "rollback:"
  echo "git checkout \"$TAG\""
  exit 2
fi

echo
echo "== list routes =="
chmod +x scripts/fpc_list_backend_routes_v2.sh
./scripts/fpc_list_backend_routes_v2.sh

echo
echo "rollback:"
echo "git checkout \"$TAG\""
