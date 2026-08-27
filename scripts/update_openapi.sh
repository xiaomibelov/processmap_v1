#!/usr/bin/env bash
set -euo pipefail

# scripts/update_openapi.sh — обновить docs/openapi.yaml из живого кода backend.
#
# Что делает:
#   1. Дампит app.openapi() через scripts/dump_openapi.py (русская обогащённая спека).
#   2. Линтует docs/openapi.yaml через @redocly/cli lint (в Docker, если node не установлен).
#   3. Показывает дифф-статистику: сколько paths/operations добавлено/удалено.
#
# Использование:
#   ./scripts/update_openapi.sh
#   ./scripts/update_openapi.sh --no-lint   # пропустить линт (быстрее, но не для PR)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SPEC_PATH="${REPO_ROOT}/docs/openapi.yaml"
BUILD_DIR="${REPO_ROOT}/build"
LINT=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-lint) LINT=0; shift ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "${BUILD_DIR}"

# ---------------------------------------------------------------------------
# 1. Сохранить старый снапшот для сравнения
# ---------------------------------------------------------------------------
OLD_PATHS=0
OLD_OPS=0
if [[ -f "${SPEC_PATH}" ]]; then
  OLD_PATHS=$(grep -cE '^  /' "${SPEC_PATH}" 2>/dev/null || true)
  OLD_OPS=$(grep -cE '^(    get:|    post:|    put:|    patch:|    delete:|    head:|    options:)' "${SPEC_PATH}" 2>/dev/null || true)
fi

# ---------------------------------------------------------------------------
# 2. Дамп живой спеки
# ---------------------------------------------------------------------------
echo "[openapi] dumping live spec → ${SPEC_PATH}"
if python3 -c "import fastapi" >/dev/null 2>&1; then
  python3 "${SCRIPT_DIR}/dump_openapi.py" --out "${SPEC_PATH}"
else
  echo "[openapi] fastapi not found on host; running dump inside backend Docker image ..."
  docker run --rm -v "${REPO_ROOT}:/app" -w /app processmap_v1-api \
    python scripts/dump_openapi.py --out docs/openapi.yaml
fi

# ---------------------------------------------------------------------------
# 3. Линт (Redocly в Docker — node на хосте не обязателен)
# ---------------------------------------------------------------------------
if [[ "${LINT}" -eq 1 ]]; then
  echo "[openapi] linting with @redocly/cli ..."
  if command -v npx >/dev/null 2>&1; then
    npx @redocly/cli lint "${SPEC_PATH}" --extends recommended
  else
    docker run --rm -v "${REPO_ROOT}:/ws" -w /ws node:20-alpine \
      npx @redocly/cli lint docs/openapi.yaml --extends recommended
  fi
else
  echo "[openapi] lint skipped (--no-lint)"
fi

# ---------------------------------------------------------------------------
# 4. Дифф-статистика
# ---------------------------------------------------------------------------
NEW_PATHS=$(grep -cE '^  /' "${SPEC_PATH}" 2>/dev/null || true)
NEW_OPS=$(grep -cE '^(    get:|    post:|    put:|    patch:|    delete:|    head:|    options:)' "${SPEC_PATH}" 2>/dev/null || true)

DELTA_PATHS=$((NEW_PATHS - OLD_PATHS))
DELTA_OPS=$((NEW_OPS - OLD_OPS))

printf "[openapi] stats: paths %d (%+d), operations %d (%+d)\n" \
  "${NEW_PATHS}" "${DELTA_PATHS}" "${NEW_OPS}" "${DELTA_OPS}"

echo "[openapi] done. Review 'git diff -- docs/openapi.yaml' before committing."
