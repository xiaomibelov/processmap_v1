#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_pack_needed_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/fpc_needed_${TS}.zip"

echo
echo "== checkpoint tag (pack) =="
git tag -a "$TAG" -m "checkpoint: pack needed files (${TS})" >/dev/null 2>&1 || true
echo "$TAG"

mkdir -p "$ZIP_DIR"

INCLUDE=()

# frontend (UI / styles / workflow)
for p in \
  "frontend/src" \
  "frontend/index.html" \
  "frontend/package.json" \
  "frontend/package-lock.json" \
  "frontend/vite.config.js" \
  "frontend/vite.config.mjs" \
  "frontend/vite.config.ts" \
  "frontend/public" \
  "frontend/README.md" \
  "docs/contract_session_api.md"
do
  if [ -e "$p" ]; then
    INCLUDE+=("$p")
  fi
done

# backend minimal (API contract / session write / bpmn)
for p in \
  "backend/app/main.py" \
  "backend/app/models.py" \
  "backend/app/settings.py" \
  "backend/requirements.txt"
do
  if [ -e "$p" ]; then
    INCLUDE+=("$p")
  fi
done

echo
echo "== include list =="
printf '%s\n' "${INCLUDE[@]}"

echo
echo "== zip =="
rm -f "$ZIP_PATH" >/dev/null 2>&1 || true

zip -r "$ZIP_PATH" "${INCLUDE[@]}" \
  -x "frontend/node_modules/*" \
  -x "frontend/dist/*" \
  -x "artifacts/*" \
  -x ".git/*" \
  -x ".venv/*" \
  -x "**/__pycache__/*" \
  >/dev/null

ls -la "$ZIP_PATH" || true

echo
echo "rollback:"
echo "git checkout \"$TAG\""
