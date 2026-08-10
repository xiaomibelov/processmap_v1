#!/usr/bin/env bash
# stage-update.sh — единая команда «докатить origin/main на stage со 100% гарантией».
#
# Зачем: инцидент 2026-08-10 — PR #711 смержен, но stage показывал UI месячной
# давности: stage-клон стоял на старой ветке (main не был обновлён), образы были
# собраны вручную давно, deploy/deploy.sh не запускался. Деплой «по памятке»
# молча расходится с реальностью.
#
# Гарантии этого скрипта (fail-fast, любой сбой = ненулевой выход):
#   1. Репозиторий ПРИНУДИТЕЛЬНО переводится на origin/main (ff-only), а не
#      «что лежит в working tree» — untracked-блокеры merge уносятся в backup.
#   2. Сборка api+frontend — всегда --no-cache (deploy/deploy.sh уже делает так):
#      pip/npm-зависимости не могут остаться от старого образа.
#   3. Post-deploy VERIFY: sha, который реально отдаёт фронт (build-info.json)
#      и api (/version), сравнивается с git rev-parse HEAD. Не совпало —
#      деплой считается НЕУДАЧНЫМ, никаких «наверное докатилось».
#
# Использование:
#   deploy/stage-update.sh            # полный цикл: update → build → restart → verify
#   deploy/stage-update.sh --verify-only   # только проверка «что сейчас на stage»
#
set -euo pipefail

cd "$(dirname "$0")/.."

FRONTEND_URL="${FRONTEND_URL:-http://localhost:${FRONTEND_PORT:-5177}}"
API_URL="${API_URL:-http://localhost:${HOST_PORT:-8011}}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/stage-update-untracked-backup}"

log() { echo "[STAGE-UPDATE] $*"; }
fail() { echo "[STAGE-UPDATE] FAIL: $*" >&2; exit 1; }

# --- verify: что реально отдаёт stage прямо сейчас ---
verify() {
  local expected_sha expected_short front_sha api_build rc=0
  expected_sha="$(git rev-parse HEAD)"
  expected_short="$(git rev-parse --short HEAD)"

  front_sha="$(curl -fsS "${FRONTEND_URL}/build-info.json" 2>/dev/null | sed -n 's/.*"sha":[[:space:]]*"\([0-9a-f]*\)".*/\1/p' | head -1)"
  if [ "${front_sha}" = "${expected_short}" ] || [ "${front_sha}" = "${expected_sha}" ]; then
    log "VERIFY frontend OK: build-info.json sha=${front_sha} == HEAD (${expected_short})"
  else
    log "VERIFY frontend MISMATCH: build-info.json sha='${front_sha:-unavailable}', ожидался ${expected_short}"
    rc=1
  fi

  api_build="$(curl -fsS "${API_URL}/version" 2>/dev/null | sed -n 's/.*"\(build_id\|buildId\|commit\)"[:= ]*"\([0-9a-zA-Z._-]*\)".*/\2/p' | head -1)"
  if [ -z "${api_build}" ]; then
    log "VERIFY api WARN: /version не вернул build_id — проверьте вручную (${API_URL}/version)"
  elif [ "${api_build}" = "${expected_short}" ] || [ "${expected_sha}" = "${api_build}"* ]; then
    log "VERIFY api OK: /version build_id=${api_build}"
  else
    log "VERIFY api MISMATCH: /version build_id='${api_build}', ожидался ${expected_short}"
    rc=1
  fi
  return ${rc}
}

if [ "${1:-}" = "--verify-only" ]; then
  verify
  exit $?
fi

# --- 1. Репозиторий → origin/main (принудительно, ff-only) ---
log "1/4 Обновляю репозиторий до origin/main…"
git fetch origin main --quiet

dirty="$(git status --porcelain --untracked-files=no | grep -v '^ M .env$' || true)"
if [ -n "${dirty}" ]; then
  fail "В working tree есть незакоммиченные изменения (tracked, кроме .env — его перегенерирует deploy.sh):\n${dirty}"
fi

# Untracked-файлы, которые перезапишет merge, — в backup (инцидент 2026-08-10:
# 4 untracked-файла вечно блокировали ff на stage-клоне).
if ! git rev-parse --verify main >/dev/null 2>&1; then
  git checkout -b main --track origin/main
else
  git checkout main --quiet
fi
if ! git merge --ff-only origin/main 2>/dev/null; then
  mkdir -p "${BACKUP_DIR}"
  git merge --ff-only origin/main 2>&1 | sed -n 's/^\t//p' | while read -r f; do
    [ -f "$f" ] || continue
    mkdir -p "${BACKUP_DIR}/$(dirname "$f")"
    mv "$f" "${BACKUP_DIR}/$f"
    log "  untracked-блокер унесён в backup: $f"
  done
  git merge --ff-only origin/main --quiet || fail "ff-only merge не удался даже после уборки untracked-блокеров"
fi
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "HEAD != origin/main после обновления"
log "  HEAD == origin/main: $(git rev-parse --short HEAD)"

# --- 2-3. Сборка + перезапуск + healthcheck (deploy/deploy.sh) ---
log "2/4 Сборка образов api+frontend (--no-cache, внутри deploy/deploy.sh)…"
log "3/4 Перезапуск + healthcheck…"
./deploy/deploy.sh

# --- 4. Post-deploy verify (гарантия «доехало») ---
log "4/4 Post-deploy verify…"
verify || fail "код НЕ доехал до stage (см. MISMATCH выше). Деплой считается неудачным."

log "OK: stage == origin/main ($(git rev-parse --short HEAD)) — обновление доехало на 100%."
