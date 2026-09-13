#!/usr/bin/env bash
# Post-гейты прод-деплоя (PLAN §2.6). Аргумент: полный SHA деплоя.
# Исполняется на хосте после up; печатает markdown-фрагмент для summary
# (в stdout и, если задан SUMMARY_FILE, в файл — summary забирает job CI).
set -euo pipefail

SHA="${1:-}"
if [ -z "${SHA}" ]; then
  echo "usage: prod_post_gates.sh <deploy-sha>" >&2
  exit 2
fi

APP_DIR="/opt/processmap/app"
ENV_FILE="/opt/processmap/env/prod.env"
BASE="https://processmap.ru"
SUMMARY_FILE="${SUMMARY_FILE:-}"

fail() {
  echo "POST-GATE FAIL: $*" >&2
  exit 1
}

# Сравнение SHA по первым 12 символам (робастность к полным/коротким SHA)
sha_eq() {
  [ "${1:0:12}" = "${2:0:12}" ]
}

PREVIOUS_BUILD_ID="$(grep -E '^PREVIOUS_BUILD_ID=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- || echo unknown)"

echo "=== [post-gate 1/6] ${BASE}/api/health: 200 и не degraded ==="
HEALTH_HTTP="$(curl -sS -m 20 -o /tmp/prod_post_health.json -w '%{http_code}' "${BASE}/api/health" 2>/dev/null || echo 000)"
[ "${HEALTH_HTTP}" = "200" ] || fail "/api/health http=${HEALTH_HTTP}"
HEALTH_BODY="$(cat /tmp/prod_post_health.json)"
echo "${HEALTH_BODY}"
HEALTH_STATUS="$(printf '%s' "${HEALTH_BODY}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' || echo parse-error)"
[ "${HEALTH_STATUS}" = "ok" ] || fail "/api/health status=${HEALTH_STATUS} (миграции применены до up — degraded здесь = реальный фейл)"
echo "OK: health 200, status=ok"

echo "=== [post-gate 2/6] ${BASE}/version commit == ${SHA} ==="
VERSION_JSON="$(curl -fsS -m 20 "${BASE}/version" || fail "/version недоступен")"
SERVED_COMMIT="$(printf '%s' "${VERSION_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("commit",""))' || true)"
echo "served=${SERVED_COMMIT}"
sha_eq "${SERVED_COMMIT}" "${SHA}" || fail "/version commit=${SERVED_COMMIT} != ${SHA} (поднят старый api-образ?)"
echo "OK: /version совпадает"

echo "=== [post-gate 3/6] ${BASE}/agent/version commit == ${SHA} ==="
AGENT_JSON="$(curl -fsS -m 20 "${BASE}/agent/version" || fail "/agent/version недоступен")"
AGENT_COMMIT="$(printf '%s' "${AGENT_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("commit",""))' || true)"
echo "served=${AGENT_COMMIT}"
sha_eq "${AGENT_COMMIT}" "${SHA}" || fail "/agent/version commit=${AGENT_COMMIT} != ${SHA}"
echo "OK: /agent/version совпадает"

echo "=== [post-gate 4/6] celery: регистрация канонических задач ==="
"${APP_DIR}/deploy/verify_celery_task.sh" \
  --container app-celery-worker-1 \
  --task index_session_bpmn_xml \
  --retries 10 --delay 3 --timeout 10
"${APP_DIR}/deploy/verify_celery_task.sh" \
  --container app-celery-worker-1 \
  --task processmap.rag.embed_chunks \
  --retries 10 --delay 3 --timeout 10
echo "OK: celery-задачи зарегистрированы"

echo "=== [post-gate 5/6] TLS: валидность и срок сертификата ==="
TLS_PEM="$(echo | openssl s_client -connect processmap.ru:443 -servername processmap.ru 2>/dev/null)"
printf '%s' "${TLS_PEM}" | openssl x509 -noout -checkend 0 >/dev/null 2>&1 \
  || fail "TLS-сертификат processmap.ru просрочен/невалиден"
printf '%s' "${TLS_PEM}" | openssl x509 -noout -dates
echo "OK: TLS валиден"

echo "=== [post-gate 6/6] внешний smoke: http-redirect и clearvestnic ==="
REDIRECT_HEADERS="$(curl -sS -m 20 -o /dev/null -D - "http://processmap.ru/" 2>/dev/null || true)"
REDIRECT_CODE="$(printf '%s' "${REDIRECT_HEADERS}" | head -1 | grep -oE '[0-9]{3}' | head -1 || true)"
printf '%s' "${REDIRECT_HEADERS}" | grep -qi '^Location:' || fail "http://processmap.ru не отдаёт редирект (код=${REDIRECT_CODE})"
LOCATION="$(printf '%s' "${REDIRECT_HEADERS}" | grep -i '^Location:' | tr -d '\r' | cut -d' ' -f2-)"
echo "redirect: ${REDIRECT_CODE} → ${LOCATION}"
case "${LOCATION}" in
  https://*) : ;;
  *) fail "Location=${LOCATION} содержит не-https схему (даунгрейд #933)" ;;
esac
INDEX_HTML="$(curl -fsS -m 20 "${BASE}/" || fail "главная недоступна")"
CLEARVESTNIC_COUNT="$(printf '%s' "${INDEX_HTML}" | grep -c 'clearvestnic' || true)"
[ "${CLEARVESTNIC_COUNT}" = "0" ] || fail "в HTML главной найден clearvestnic (${CLEARVESTNIC_COUNT} вхождений) — домен выведен навсегда"
echo "OK: редирект https, clearvestnic отсутствует"

echo "POST-GATES: все гейты зелёные"

# --- Markdown-фрагмент для $GITHUB_STEP_SUMMARY ---
SUMMARY_MD="$(mktemp /tmp/prod-post-gates-summary.XXXXXX.md)"
{
  echo "## Prod deploy: ${PREVIOUS_BUILD_ID} → ${SHA}"
  echo ""
  echo "- BUILD_ID (stalo): \`${SHA}\`"
  echo "- BUILD_ID (bylo): \`${PREVIOUS_BUILD_ID}\`"
  echo "- /version, /agent/version: commit == ${SHA:0:12} ✅"
  echo "- /api/health: 200, status=ok, миграции применены до up ✅"
  echo "- celery: index_session_bpmn_xml, processmap.rag.embed_chunks зарегистрированы ✅"
  echo "- TLS валиден; http→https редирект без http-схемы; clearvestnic=0 ✅"
  echo "- Бэкап БД: \`/opt/processmap/data/prod/backups/pre-pipeline-<TS>.dump\` (pg_restore --list пройден)"
  echo ""
  echo "Откат одной командой (тот же approve-гейт prod):"
  echo "\`gh workflow run rollback-prod.yml -f predeploy_ts=<TS>\`"
  echo "(<TS> — метка окна из лога deploy-шага; откат данных — только restore из дампа, отдельный approve)"
} > "${SUMMARY_MD}"
cat "${SUMMARY_MD}"
if [ -n "${SUMMARY_FILE}" ]; then
  cp "${SUMMARY_MD}" "${SUMMARY_FILE}"
  echo "[post-gates] summary written: ${SUMMARY_FILE}"
fi
rm -f "${SUMMARY_MD}"
