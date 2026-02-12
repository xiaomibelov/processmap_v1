#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_pack_needed_${TS}"

echo
echo "== checkpoint tag =="
git tag -a "$TAG" -m "checkpoint: pack needed files (${TS})" >/dev/null 2>&1 || true
echo "$TAG"

ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/fpc_needed_${TS}.zip"
LIST_PATH="${ZIP_DIR}/fpc_needed_files_${TS}.txt"

mkdir -p "$ZIP_DIR"
: > "$LIST_PATH"

add_path () {
  local p="$1"
  if [ -e "$p" ]; then
    echo "$p" >> "$LIST_PATH"
  else
    echo "MISS: $p"
  fi
}

echo
echo "== collect paths =="

# Frontend (UI + workflow + api)
add_path "frontend/src"
add_path "frontend/index.html"
add_path "frontend/vite.config.js"
add_path "frontend/package.json"
add_path "frontend/package-lock.json"

# Contract/docs
add_path "docs/contract_session_api.md"

# Backend ядро (чтобы понимать контракт и текущие endpoints)
add_path "backend/app/main.py"
add_path "backend/app/models.py"
add_path "backend/app/settings.py"
add_path "backend/requirements.txt"

echo
echo "== file list =="
sed -n '1,220p' "$LIST_PATH" || true

echo
echo "== zip =="
if [ ! -s "$LIST_PATH" ]; then
  echo "ERROR: list is empty"
  false
fi

# zip по списку (без node_modules/dist, мы их не добавляем)
zip -r "$ZIP_PATH" -@ < "$LIST_PATH" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== done =="
echo "artifact: $ZIP_PATH"
echo "rollback:"
echo "git checkout \"$TAG\""
