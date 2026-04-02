cd "$(git rev-parse --show-toplevel)" || exit 1
set -e

HOST_PORT="$(grep -E '^HOST_PORT=' .env 2>/dev/null | head -n1 | cut -d= -f2)"
if [ -z "$HOST_PORT" ]; then HOST_PORT="8000"; fi
BASE="http://127.0.0.1:${HOST_PORT}"

OUT_DIR="$HOME/fpc_api_routes_$(date +%F_%H%M%S)"
mkdir -p "$OUT_DIR"

TAG="cp/fpc_list_backend_routes_v2_$(date +%F_%H%M%S)"
git tag -a "$TAG" -m "checkpoint: list backend routes v2" >/dev/null 2>&1 || true

echo "BASE=$BASE"
echo "OUT_DIR=$OUT_DIR"
echo "TAG=$TAG"

try_fetch () {
  URL="$1"
  OUT="$2"
  HTTP="$(curl -sS -o "$OUT" -w "%{http_code}" "$URL" || true)"
  echo "$HTTP" > "$OUT.http"
  if [ "$HTTP" = "200" ] && [ -s "$OUT" ]; then
    echo "OK: $URL -> $OUT"
    return 0
  fi
  return 1
}

OPENAPI="$OUT_DIR/openapi.json"

if try_fetch "$BASE/openapi.json" "$OPENAPI"; then
  :
elif try_fetch "$BASE/api/openapi.json" "$OPENAPI"; then
  :
elif try_fetch "$BASE/openapi.json?format=json" "$OPENAPI"; then
  :
else
  echo "FAIL: cannot fetch openapi.json from common locations."
  echo "Tried:"
  echo " - $BASE/openapi.json"
  echo " - $BASE/api/openapi.json"
  echo " - $BASE/openapi.json?format=json"
  echo
  echo "Probe tip:"
  echo "  curl -sS -v \"$BASE/api/meta\""
  echo
  echo "rollback:"
  echo "  git checkout \"$TAG\""
  exit 2
fi

export OPENAPI_PATH="$OPENAPI"

python3 -c '
import json, os
p=os.environ["OPENAPI_PATH"]
spec=json.load(open(p, "r", encoding="utf-8"))
paths=spec.get("paths") or {}
items=[]
for path, methods in paths.items():
    if not isinstance(methods, dict):
        continue
    for m, meta in methods.items():
        if m.lower() not in {"get","post","put","patch","delete","options","head"}:
            continue
        summary=""
        if isinstance(meta, dict):
            summary = meta.get("summary") or meta.get("description") or ""
            summary = " ".join(summary.split())
        items.append((path, m.upper(), summary))
items.sort(key=lambda x: (x[0], x[1]))
for path, m, summary in items:
    if summary:
        print(f"{m:6} {path}  —  {summary}")
    else:
        print(f"{m:6} {path}")
' || true

echo
echo "artifacts:"
ls -lah "$OUT_DIR" | sed -n '1,200p' || true

echo
echo "rollback:"
echo "git checkout \"$TAG\""
