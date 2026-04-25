#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy/scripts/stage_freshness_proof.sh prepare-source --requested-ref REF --resolved-sha SHA
  deploy/scripts/stage_freshness_proof.sh verify-chain --requested-ref REF --resolved-sha SHA
  deploy/scripts/stage_freshness_proof.sh [verify-chain] --requested-ref REF --resolved-sha SHA

Environment overrides for local validation:
  STAGE_URL                      Stage URL to fetch (default: https://stage.processmap.ru)
  STAGE_FRESHNESS_SOURCE_FILE    Source fingerprint file (default: frontend/.stage-deploy-fingerprint.json)
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

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

build_fingerprint() {
  printf 'processmap-stage-deploy-sha:%s' "$RESOLVED_SHA"
}

assert_path_exists() {
  local path="$1"
  local label="$2"
  [ -e "$path" ] || fail "$label does not exist: $path"
}

assert_file_contains_fixed() {
  local path="$1"
  local expected="$2"
  local label="$3"
  grep -F -- "$expected" "$path" >/dev/null || fail "$label missing expected value: $expected"
}

assert_remote_file_contains_fixed() {
  local container_id="$1"
  local path="$2"
  local expected="$3"
  local label="$4"
  docker exec "$container_id" sh -lc "grep -F -- '$expected' '$path' >/dev/null" \
    || fail "$label missing expected value: $expected"
}

write_source_fingerprint_file() {
  local escaped_ref
  local escaped_sha
  local escaped_fingerprint
  escaped_ref="$(json_escape "$REQUESTED_REF")"
  escaped_sha="$(json_escape "$RESOLVED_SHA")"
  escaped_fingerprint="$(json_escape "$DEPLOY_FINGERPRINT")"
  mkdir -p "$(dirname "$SOURCE_FINGERPRINT_FILE")"
  cat >"$SOURCE_FINGERPRINT_FILE" <<EOF
{
  "requested_ref": "$escaped_ref",
  "resolved_sha": "$escaped_sha",
  "fingerprint": "$escaped_fingerprint"
}
EOF
}

verify_source_fingerprint_file() {
  assert_path_exists "$SOURCE_FINGERPRINT_FILE" "source fingerprint file"
  assert_file_contains_fixed "$SOURCE_FINGERPRINT_FILE" "\"requested_ref\": \"$REQUESTED_REF\"" "source fingerprint file"
  assert_file_contains_fixed "$SOURCE_FINGERPRINT_FILE" "\"resolved_sha\": \"$RESOLVED_SHA\"" "source fingerprint file"
  assert_file_contains_fixed "$SOURCE_FINGERPRINT_FILE" "\"fingerprint\": \"$DEPLOY_FINGERPRINT\"" "source fingerprint file"
}

MODE="verify-chain"
REQUESTED_REF=""
RESOLVED_SHA=""
if [ "$#" -gt 0 ]; then
  case "$1" in
    prepare-source|verify-chain)
      MODE="$1"
      shift
      ;;
  esac
fi
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
SOURCE_FINGERPRINT_FILE="${STAGE_FRESHNESS_SOURCE_FILE:-frontend/.stage-deploy-fingerprint.json}"
ROOT_OVERRIDE="${STAGE_FRESHNESS_GATEWAY_ROOT:-}"
HTML_OVERRIDE="${STAGE_FRESHNESS_HTML_FILE:-}"
JS_OVERRIDE="${STAGE_FRESHNESS_JS_FILE:-}"
CACHE_BUST_TOKEN="${REQUESTED_REF//[^A-Za-z0-9._-]/_}-${RESOLVED_SHA:0:12}"
DEPLOY_FINGERPRINT="$(build_fingerprint)"

log "requested ref: $REQUESTED_REF"
log "resolved sha: $RESOLVED_SHA"
log "source fingerprint file: $SOURCE_FINGERPRINT_FILE"
log "source fingerprint: $DEPLOY_FINGERPRINT"

if [ "$MODE" = "prepare-source" ]; then
  write_source_fingerprint_file
  verify_source_fingerprint_file
  log "source fingerprint proof: PASS file=$(basename "$SOURCE_FINGERPRINT_FILE") fingerprint=$DEPLOY_FINGERPRINT"
  exit 0
fi

verify_source_fingerprint_file
log "source fingerprint proof: PASS file=$(basename "$SOURCE_FINGERPRINT_FILE") fingerprint=$DEPLOY_FINGERPRINT"

BUILT_BUNDLE_PATH=""
BUILT_BUNDLE_NAME=""
BUILT_BUNDLE_FINGERPRINT=""
BUILT_BUNDLE_SHA256=""
SERVED_BUNDLE_PATH=""
SERVED_BUNDLE_NAME=""
SERVED_BUNDLE_FINGERPRINT=""
SERVED_BUNDLE_SHA256=""

if [ -n "$ROOT_OVERRIDE" ]; then
  [ -d "$ROOT_OVERRIDE" ] || fail "override gateway root does not exist: $ROOT_OVERRIDE"
  BUILT_BUNDLE_PATH="$(find "$ROOT_OVERRIDE/assets" -maxdepth 1 -type f -name 'index-*.js' | sort | head -n 1)"
  [ -n "$BUILT_BUNDLE_PATH" ] || fail "no built bundle found under override gateway root: $ROOT_OVERRIDE/assets"
  BUILT_BUNDLE_NAME="$(basename "$BUILT_BUNDLE_PATH")"
  assert_file_contains_fixed "$BUILT_BUNDLE_PATH" "$DEPLOY_FINGERPRINT" "built bundle"
  BUILT_BUNDLE_FINGERPRINT="$DEPLOY_FINGERPRINT"
  BUILT_BUNDLE_SHA256="$(hash_file_local "$BUILT_BUNDLE_PATH")"
else
  GATEWAY_CID="$(compose_stage ps -q gateway)"
  [ -n "$GATEWAY_CID" ] || fail "gateway container is not running"
  BUILT_BUNDLE_PATH="$(docker exec "$GATEWAY_CID" sh -lc 'ls -1 /usr/share/nginx/html/assets/index-*.js 2>/dev/null | sort | head -n 1')"
  [ -n "$BUILT_BUNDLE_PATH" ] || fail "no built bundle found in running gateway container"
  BUILT_BUNDLE_NAME="$(basename "$BUILT_BUNDLE_PATH")"
  assert_remote_file_contains_fixed "$GATEWAY_CID" "$BUILT_BUNDLE_PATH" "$DEPLOY_FINGERPRINT" "built bundle"
  BUILT_BUNDLE_FINGERPRINT="$DEPLOY_FINGERPRINT"
  BUILT_BUNDLE_SHA256="$(docker exec "$GATEWAY_CID" sh -lc "sha256sum '$BUILT_BUNDLE_PATH' | awk '{print \$1}'")"
fi

log "built bundle path: $BUILT_BUNDLE_PATH"
log "built bundle name: $BUILT_BUNDLE_NAME"
log "built bundle fingerprint: $BUILT_BUNDLE_FINGERPRINT"
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
  assert_file_contains_fixed "$JS_OVERRIDE" "$DEPLOY_FINGERPRINT" "served bundle"
  SERVED_BUNDLE_FINGERPRINT="$DEPLOY_FINGERPRINT"
  SERVED_BUNDLE_SHA256="$(hash_file_local "$JS_OVERRIDE")"
else
  TMP_JS="$(mktemp /tmp/stage_freshness_bundle.XXXXXX.js)"
  trap 'rm -f "$TMP_JS"' EXIT
  curl -ksS -H 'Cache-Control: no-cache' "${STAGE_URL}/${SERVED_BUNDLE_PATH}?fresh=${CACHE_BUST_TOKEN}" -o "$TMP_JS"
  assert_file_contains_fixed "$TMP_JS" "$DEPLOY_FINGERPRINT" "served bundle"
  SERVED_BUNDLE_FINGERPRINT="$DEPLOY_FINGERPRINT"
  SERVED_BUNDLE_SHA256="$(hash_file_local "$TMP_JS")"
fi

log "served bundle path: $SERVED_BUNDLE_PATH"
log "served bundle name: $SERVED_BUNDLE_NAME"
log "served bundle fingerprint: $SERVED_BUNDLE_FINGERPRINT"
log "served bundle sha256: $SERVED_BUNDLE_SHA256"

[ "$BUILT_BUNDLE_NAME" = "$SERVED_BUNDLE_NAME" ] || fail "served bundle name mismatch: built=$BUILT_BUNDLE_NAME served=$SERVED_BUNDLE_NAME"
[ "$BUILT_BUNDLE_FINGERPRINT" = "$SERVED_BUNDLE_FINGERPRINT" ] || fail "served bundle fingerprint mismatch: built=$BUILT_BUNDLE_FINGERPRINT served=$SERVED_BUNDLE_FINGERPRINT"
[ "$BUILT_BUNDLE_SHA256" = "$SERVED_BUNDLE_SHA256" ] || fail "served bundle sha256 mismatch: built=$BUILT_BUNDLE_SHA256 served=$SERVED_BUNDLE_SHA256"

log "freshness proof: PASS ref=$REQUESTED_REF sha=$RESOLVED_SHA fingerprint=$DEPLOY_FINGERPRINT bundle=$BUILT_BUNDLE_NAME"
