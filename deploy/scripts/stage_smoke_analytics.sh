#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://stage.processmap.ru/api}"
API_CONTAINER="${API_CONTAINER:-processmap_stage-api-1}"
SMOKE_USER_ID="${SMOKE_USER_ID:-0217a3f745ae4bb6b72a336dd356f0d8}"

echo "[stage-smoke] API_URL=${API_URL}"

# Wait for API to be ready after deploy
echo "[stage-smoke] waiting for API health..."
for i in $(seq 1 30); do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
    echo "[stage-smoke] API health OK"
    break
  fi
  echo "[stage-smoke] API not ready yet (attempt ${i})"
  sleep 2
done

# Generate a short-lived admin token inside the stage API container
TOKEN_FILE=$(mktemp)
cat > "${TOKEN_FILE}" <<'PY'
from app.auth import create_access_token
from app.storage import get_default_org_id, upsert_org_membership
uid = "0217a3f745ae4bb6b72a336dd356f0d8"
org_id = get_default_org_id()
upsert_org_membership(org_id, uid, "admin")
print(create_access_token(uid))
PY

echo "[stage-smoke] generating admin token..."
docker cp "${TOKEN_FILE}" "${API_CONTAINER}:/tmp/stage_smoke_token.py"
TOKEN=$(docker exec "${API_CONTAINER}" bash -c "cd /app/backend && PYTHONPATH=/app/backend python -u /tmp/stage_smoke_token.py")
rm -f "${TOKEN_FILE}" "${TOKEN_FILE}"
test -n "${TOKEN}"
echo "[stage-smoke] token ok"

RUN_ID="$(date +%s)"
BPMN_XML='<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Activity_1" name="Smoke Task">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="smokeProp" value="smokeValue"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1"/>
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
</bpmn:definitions>'

dump_api_logs() {
  echo "[stage-smoke] last 50 lines of API container logs:" >&2
  docker logs --tail=50 "${API_CONTAINER}" >&2 || true
}

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp_out; tmp_out="$(mktemp)"
  local http_code
  if [ -n "${body}" ]; then
    http_code=$(curl -sS -o "${tmp_out}" -w '%{http_code}' -X "${method}" "${API_URL}${path}" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "${body}")
  else
    http_code=$(curl -sS -o "${tmp_out}" -w '%{http_code}' -X "${method}" "${API_URL}${path}" \
      -H "Authorization: Bearer ${TOKEN}")
  fi
  if [ "${http_code}" -ge 400 ]; then
    echo "[stage-smoke] API error: ${method} ${path} -> ${http_code}" >&2
    cat "${tmp_out}" >&2
    dump_api_logs
    rm -f "${tmp_out}"
    exit 1
  fi
  cat "${tmp_out}"
  rm -f "${tmp_out}"
}

# Retry wrapper for requests that may hit a freshly-restarted API
api_with_retry() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local attempts=10
  local delay=3
  local i
  for i in $(seq 1 ${attempts}); do
    local tmp_out; tmp_out="$(mktemp)"
    local http_code
    if [ -n "${body}" ]; then
      http_code=$(curl -sS -o "${tmp_out}" -w '%{http_code}' -X "${method}" "${API_URL}${path}" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer ${TOKEN}" \
        -d "${body}")
    else
      http_code=$(curl -sS -o "${tmp_out}" -w '%{http_code}' -X "${method}" "${API_URL}${path}" \
        -H "Authorization: Bearer ${TOKEN}")
    fi
    if [ "${http_code}" -lt 400 ]; then
      cat "${tmp_out}"
      rm -f "${tmp_out}"
      return 0
    fi
    echo "[stage-smoke] ${method} ${path} -> ${http_code} (attempt ${i}/${attempts})" >&2
    cat "${tmp_out}" >&2
    rm -f "${tmp_out}"
    if [ "${i}" -lt "${attempts}" ]; then
      sleep "${delay}"
    fi
  done
  dump_api_logs
  exit 1
}

echo "[stage-smoke] creating project..."
PROJECT=$(api_with_retry POST /api/projects "{\"title\": \"Smoke Project ${RUN_ID}\"}")
PROJECT_ID=$(echo "${PROJECT}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id") or json.load(sys.stdin).get("project_id"))')
test -n "${PROJECT_ID}"
echo "[stage-smoke] project=${PROJECT_ID}"

echo "[stage-smoke] creating session..."
SESSION=$(api POST "/api/projects/${PROJECT_ID}/sessions" "{\"title\": \"Smoke Session ${RUN_ID}\"}")
SESSION_ID=$(echo "${SESSION}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id") or json.load(sys.stdin).get("session_id"))')
test -n "${SESSION_ID}"
echo "[stage-smoke] session=${SESSION_ID}"

echo "[stage-smoke] uploading BPMN..."
# JSON-escape BPMN for curl body
BPMN_JSON=$(printf '%s' "${BPMN_XML}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
api PUT "/api/sessions/${SESSION_ID}/bpmn" "{\"xml\": ${BPMN_JSON}, \"rev\": 0}"

echo "[stage-smoke] recomputing analytics..."
api POST "/api/sessions/${SESSION_ID}/recompute" '{}'

sleep 2

echo "[stage-smoke] checking /api/analytics/properties..."
PROPS=$(api GET "/api/analytics/properties?scope=session&scope_id=${SESSION_ID}&limit=50")
ROW_COUNT=$(echo "${PROPS}" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("data",{}).get("rows",[])))')
echo "[stage-smoke] rows=${ROW_COUNT}"
if [ "${ROW_COUNT}" -lt 1 ]; then
  echo "[stage-smoke] FAIL: expected at least 1 property row" >&2
  exit 1
fi

echo "[stage-smoke] checking bpmn_name and session_count fields..."
python3 - <<PY
import json, sys
data = json.loads('''${PROPS}''')
rows = data.get("data", {}).get("rows", [])
for r in rows:
    if "bpmn_name" not in r or "session_count" not in r:
        print("FAIL: row missing bpmn_name/session_count", r, file=sys.stderr)
        sys.exit(1)
    if r.get("bpmn_name") != "Smoke Task":
        print("FAIL: unexpected bpmn_name", r.get("bpmn_name"), file=sys.stderr)
        sys.exit(1)
    if r.get("session_count") != 1:
        print("FAIL: unexpected session_count", r.get("session_count"), file=sys.stderr)
        sys.exit(1)
print("OK: bpmn_name and session_count fields present and valid")
PY

echo "[stage-smoke] checking CSV export..."
CSV_OUT=$(mktemp)
curl -sS -o "${CSV_OUT}" -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/analytics/properties/export.csv?scope=session&scope_id=${SESSION_ID}"
HEADERS=$(head -1 "${CSV_OUT}")
echo "[stage-smoke] csv headers=${HEADERS}"
if ! printf '%s' "${HEADERS}" | grep -q 'bpmn_name'; then
  echo "[stage-smoke] FAIL: CSV missing bpmn_name header" >&2
  exit 1
fi
if ! printf '%s' "${HEADERS}" | grep -q 'session_count'; then
  echo "[stage-smoke] FAIL: CSV missing session_count header" >&2
  exit 1
fi
# Check data row has Smoke Task
if ! grep -q 'Smoke Task' "${CSV_OUT}"; then
  echo "[stage-smoke] FAIL: CSV missing Smoke Task row" >&2
  exit 1
fi
rm -f "${CSV_OUT}"
echo "[stage-smoke] CSV OK"

echo "[stage-smoke] checking XLSX export..."
XLSX_OUT=$(mktemp)
curl -sS -o "${XLSX_OUT}" -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/analytics/properties/export.xlsx?scope=session&scope_id=${SESSION_ID}"
python3 - <<PY
import zipfile, sys, io
with zipfile.ZipFile("${XLSX_OUT}", "r") as z:
    ss = z.read("xl/sharedStrings.xml").decode("utf-8", errors="ignore")
if "BPMN Name" not in ss:
    print("FAIL: XLSX missing BPMN Name header", file=sys.stderr)
    sys.exit(1)
if "Использовано в сессиях" not in ss:
    print("FAIL: XLSX missing 'Использовано в сессиях' header", file=sys.stderr)
    sys.exit(1)
if "Smoke Task" not in ss:
    print("FAIL: XLSX missing Smoke Task bpmn_name", file=sys.stderr)
    sys.exit(1)
print("OK: XLSX headers and bpmn_name present")
PY
rm -f "${XLSX_OUT}"
echo "[stage-smoke] XLSX OK"

echo "[stage-smoke] all checks passed"
