#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)" || true

set -u

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_diag_app_crash_after_analytics_v1_${TS}"
git tag -a "$TAG" -m "checkpoint: diag app crash after analytics (${TS})" >/dev/null 2>&1 || true

echo "== git =="
git status -sb || true
echo
git show -s --format='%ci %h %d %s' || true

echo
echo "== docker compose ps =="
docker compose ps || true

echo
echo "== restart app =="
docker compose restart app || true

echo
echo "== docker compose ps (after restart) =="
docker compose ps || true

echo
echo "== last 260 log lines (app) =="
docker compose logs --tail=260 app | sed -n '1,260p' || true

echo
echo "== probe meta (best-effort) =="
HOST_PORT="$(grep -E '^HOST_PORT=' .env 2>/dev/null | head -n1 | cut -d= -f2)"
if [ -z "$HOST_PORT" ]; then HOST_PORT="8000"; fi
BASE="http://127.0.0.1:${HOST_PORT}"
curl -sS -v "$BASE/api/meta" 2>&1 | sed -n '1,220p' || true

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
