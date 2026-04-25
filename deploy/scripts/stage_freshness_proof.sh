#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy/scripts/stage_freshness_proof.sh --requested-ref REF --resolved-sha SHA

Environment overrides for local validation:
  STAGE_URL                      Stage URL to fetch (default: https://stage.processmap.ru)
  STAGE_FRESHNESS_GATEWAY_ROOT   Local filesystem root that mimics /usr/share/nginx/html
  STAGE_FRESHNESS_HTML_FILE      Local HTML file to use instead of curling stage root
  STAGE_FRESHNESS_JS_FILE        Local JS file to use instead of curling served bundle
EOF
}

log() {
  echo "[stage-freshness] $*"
}

fail() {
  echo "[stage-freshness] ERROR: $*" >&2
  exit 1
}

hash_file_local() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    LC_ALL=C shasum -a 256 "$path" | awk '{print $1}'
  else
    fail "neither sha256sum nor shasum is available"
  fi
}

compose_stage() {
  APP_ENV_FILE=.env.stage docker compose \
    --env-file .env.stage \
    -f docker-compose.yml \
    -f docker-compose.stage.yml \
    -p processmap_stage \
    "$@"
}

REQUESTED_REF=""
RESOLVED_SHA=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --requested-ref) REQUESTED_REF="$2"; shift 2 ;;
    --resolved-sha) RESOLVED_SHA="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[ -n "$REQUESTED_REF" ] || fail "--requested-ref is required"
[ -n "$RESOLVED_SHA" ] || fail "--resolved-sha is required"

STAGE_URL="${STAGE_URL:-https://stage.processmap.ru}"
ROOT_OVERRIDE="${STAGE_FRESHNESS_GATEWAY_ROOT:-}"
HTML_OVERRIDE="${STAGE_FRESHNESS_HTML_FILE:-}"
JS_OVERRIDE="${STAGE_FRESHNESS_JS_FILE:-}"
CACHE_BUST_TOKEN="${REQUESTED_REF//[^A-Za-z0-9._-]/_}-${RESOLVED_SHA:0:12}"

log "requested ref: $REQUESTED_REF"
log "resolved sha: $RESOLVED_SHA"

BUILT_BUNDLE_PATH=""
BUILT_BUNDLE_NAME=""
BUILT_BUNDLE_SHA256=""
SERVED_BUNDLE_PATH=""
SERVED_BUNDLE_NAME=""
SERVED_BUNDLE_SHA256=""

if [ -n "$ROOT_OVERRIDE" ]; then
  [ -d "$ROOT_OVERRIDE" ] || fail "override gateway root does not exist: $ROOT_OVERRIDE"
  BUILT_BUNDLE_PATH="$(find "$ROOT_OVERRIDE/assets" -maxdepth 1 -type f -name 'index-*.js' | sort | head -n 1)"
  [ -n "$BUILT_BUNDLE_PATH" ] || fail "no built bundle found under override gateway root: $ROOT_OVERRIDE/assets"
  BUILT_BUNDLE_NAME="$(basename "$BUILT_BUNDLE_PATH")"
  BUILT_BUNDLE_SHA256="$(hash_file_local "$BUILT_BUNDLE_PATH")"
else
  GATEWAY_CID="$(compose_stage ps -q gateway)"
  [ -n "$GATEWAY_CID" ] || fail "gateway container is not running"
  BUILT_BUNDLE_PATH="$(docker exec "$GATEWAY_CID" sh -lc 'ls -1 /usr/share/nginx/html/assets/index-*.js 2>/dev/null | sort | head -n 1')"
  [ -n "$BUILT_BUNDLE_PATH" ] || fail "no built bundle found in running gateway container"
  BUILT_BUNDLE_NAME="$(basename "$BUILT_BUNDLE_PATH")"
  BUILT_BUNDLE_SHA256="$(docker exec "$GATEWAY_CID" sh -lc "sha256sum '$BUILT_BUNDLE_PATH' | awk '{print \$1}'")"
fi

log "built bundle path: $BUILT_BUNDLE_PATH"
log "built bundle name: $BUILT_BUNDLE_NAME"
log "built bundle sha256: $BUILT_BUNDLE_SHA256"

if [ -n "$HTML_OVERRIDE" ]; then
  [ -f "$HTML_OVERRIDE" ] || fail "override HTML file does not exist: $HTML_OVERRIDE"
  HTML_CONTENT="$(cat "$HTML_OVERRIDE")"
else
  HTML_CONTENT="$(curl -ksS -H 'Cache-Control: no-cache' "${STAGE_URL}/?fresh=${CACHE_BUST_TOKEN}")"
fi

SERVED_BUNDLE_PATH="$(printf '%s' "$HTML_CONTENT" | grep -o 'assets/index-[^"]*\.js' | head -n 1 || true)"
[ -n "$SERVED_BUNDLE_PATH" ] || fail "served stage HTML did not reference assets/index-*.js"
SERVED_BUNDLE_NAME="$(basename "$SERVED_BUNDLE_PATH")"

if [ -n "$JS_OVERRIDE" ]; then
  [ -f "$JS_OVERRIDE" ] || fail "override JS file does not exist: $JS_OVERRIDE"
  SERVED_BUNDLE_SHA256="$(hash_file_local "$JS_OVERRIDE")"
else
  TMP_JS="$(mktemp /tmp/stage_freshness_bundle.XXXXXX.js)"
  trap 'rm -f "$TMP_JS"' EXIT
  curl -ksS -H 'Cache-Control: no-cache' "${STAGE_URL}/${SERVED_BUNDLE_PATH}?fresh=${CACHE_BUST_TOKEN}" -o "$TMP_JS"
  SERVED_BUNDLE_SHA256="$(hash_file_local "$TMP_JS")"
fi

log "served bundle path: $SERVED_BUNDLE_PATH"
log "served bundle name: $SERVED_BUNDLE_NAME"
log "served bundle sha256: $SERVED_BUNDLE_SHA256"

[ "$BUILT_BUNDLE_NAME" = "$SERVED_BUNDLE_NAME" ] || fail "served bundle name mismatch: built=$BUILT_BUNDLE_NAME served=$SERVED_BUNDLE_NAME"
[ "$BUILT_BUNDLE_SHA256" = "$SERVED_BUNDLE_SHA256" ] || fail "served bundle sha256 mismatch: built=$BUILT_BUNDLE_SHA256 served=$SERVED_BUNDLE_SHA256"

log "freshness proof: PASS ref=$REQUESTED_REF sha=$RESOLVED_SHA bundle=$BUILT_BUNDLE_NAME"
