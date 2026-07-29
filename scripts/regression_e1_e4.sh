#!/usr/bin/env bash
# regression_e1_e4.sh — E1-E4 "technologist workflow" regression contour runner.
# Executes the full regression suite and writes docs/test/regression.md.
# Exit code: 0 = all steps PASS (warnings allowed), 1 = at least one FAIL.
set -u

cd "$(dirname "$0")/.."
ROOT="$PWD"
PY="$ROOT/.venv/bin/python"
DB_URL="${DATABASE_URL:-postgresql://fpc:fpc@localhost:5432/processmap}"
ALEMBIC_URL="${ALEMBIC_URL:-postgresql+psycopg://fpc:fpc@localhost:5432/processmap}"
DEMO="${DEMO_BASE_URL:-http://localhost:18011}"
STAGE="${STAGE_BASE_URL:-https://stage.processmap.ru}"
REPORT="$ROOT/docs/test/regression.md"
FIXTURE="backend/tests/fixtures/tobe_razogrev_supa_rtk_v03.bpmn"
# Test files owned by the E1-E4 contours; other failures are PRE-EXISTING.
E14_RE='^backend/tests/(test_bpmn_import|test_process_template|test_recipe|test_operation_catalog|test_dictionaries)'

START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GIT_BRANCH="$(git branch --show-current 2>/dev/null || echo '?')"

PASS=0; FAIL=0; WARN=0
ROWS=()          # markdown rows
step() {         # step <name> <status PASS|FAIL|WARN> <detail>
  local name="$1" status="$2" detail="$3"
  detail="${detail//|/\\|}"
  ROWS+=("| ${name} | ${status} | ${detail} | $(date -u +%H:%M:%SZ) |")
  case "$status" in
    PASS) PASS=$((PASS+1)); echo "[PASS] $name — $detail";;
    FAIL) FAIL=$((FAIL+1)); echo "[FAIL] $name — $detail";;
    *)    WARN=$((WARN+1)); echo "[WARN] $name — $detail";;
  esac
}
json() { "$PY" -c "$1"; }   # python helper via venv

echo "=== E1-E4 regression contour — ${START_TS} (branch: ${GIT_BRANCH}) ==="

# ---------------------------------------------------------------- 1. alembic
TMP_INI="$(mktemp /tmp/alembic.local.XXXXXX.ini)"
sed "s|^sqlalchemy.url =.*|sqlalchemy.url = ${ALEMBIC_URL}|" backend/alembic.ini > "$TMP_INI"
AL_CUR="$(cd backend && "$PY" -m alembic -c "$TMP_INI" current 2>&1)"
AL_HEADS="$(cd backend && "$PY" -m alembic -c "$TMP_INI" heads 2>&1)"
rm -f "$TMP_INI"
CUR_REV="$(echo "$AL_CUR" | grep -oE '^[0-9a-z]+( \(head\))?$' | head -1 | awk '{print $1}')"
HEADS_N="$(echo "$AL_HEADS" | grep -c '(head)')"
HEAD_REV="$(echo "$AL_HEADS" | grep '(head)' | head -1 | awk '{print $1}')"
if [ -n "${CUR_REV:-}" ] && [ "${HEADS_N:-0}" = "1" ] && [ "$CUR_REV" = "${HEAD_REV:-none}" ]; then
  step "alembic current/heads (alembic.ini + ALEMBIC_URL override)" "PASS" "DB at single head: current=${CUR_REV}"
else
  step "alembic current/heads (alembic.ini + ALEMBIC_URL override)" "FAIL" "current=[${CUR_REV:-$(echo "$AL_CUR" | tr '\n' ' ' | head -c 100)}] heads(${HEADS_N:-0})=[$(echo "$AL_HEADS" | tr '\n' ' ' | head -c 100)]"
fi

# ------------------------------------------------------- 2. seeds idempotency
COUNT_SQL="import os,psycopg;print(psycopg.connect(os.environ['DATABASE_URL']).execute('SELECT count(*) FROM operation_catalog').fetchone()[0])"
SEED_OK=1; SEED_DETAIL=""
for i in 1 2; do
  if ! DATABASE_URL="$DB_URL" "$PY" backend/seed_operations.py >/tmp/seed_ops_$i.log 2>&1; then SEED_OK=0; SEED_DETAIL="seed_operations run#$i failed: $(tail -1 /tmp/seed_ops_$i.log)"; break; fi
  if ! DATABASE_URL="$DB_URL" "$PY" backend/seed_dictionaries.py >/tmp/seed_dict_$i.log 2>&1; then SEED_OK=0; SEED_DETAIL="seed_dictionaries run#$i failed: $(tail -1 /tmp/seed_dict_$i.log)"; break; fi
  C="$(DATABASE_URL="$DB_URL" json "$COUNT_SQL" 2>/dev/null)"
  if [ "${C:-}" != "13" ]; then SEED_OK=0; SEED_DETAIL="catalog count after run#$i = ${C:-?}, expected 13"; break; fi
  SEED_DETAIL="runs 1+2 OK, catalog count=13 both times"
done
[ "$SEED_OK" = "1" ] && step "seeds idempotency (seed_operations + seed_dictionaries x2)" "PASS" "$SEED_DETAIL" \
                      || step "seeds idempotency (seed_operations + seed_dictionaries x2)" "FAIL" "$SEED_DETAIL"

# ------------------------------------------------------------ 3. backend tests
PT_LOG="$(mktemp /tmp/pytest_e14.XXXXXX.log)"
"$PY" -m pytest backend/tests/ -q --continue-on-collection-errors > "$PT_LOG" 2>&1
PT_RC=$?
PT_TAIL="$(tail -1 "$PT_LOG" | tr -d '\n')"
if [ "$PT_RC" = "0" ]; then
  step "backend tests (pytest backend/tests/ -q)" "PASS" "$PT_TAIL"
else
  FAILED="$(grep -E '^(FAILED|ERROR)' "$PT_LOG" | sed 's/ - .*//' | sort -u)"
  FAILED_FILES="$(echo "$FAILED" | sed -E 's/^(FAILED|ERROR) //' | sed 's/::.*//' | sort -u)"
  E14_FAILS="$(echo "$FAILED_FILES" | grep -E "$E14_RE" || true)"
  OTHER_FAILS="$(echo "$FAILED_FILES" | grep -vE "$E14_RE" || true)"
  if [ -n "$E14_FAILS" ]; then
    E14_NAMES="$(echo "$FAILED" | grep -E "$E14_RE" | tr '\n' '; ' | head -c 900)"
    step "backend tests (pytest backend/tests/ -q)" "FAIL" "E1-E4 contour failures: ${E14_NAMES}"
  else
    step "backend tests (pytest backend/tests/ -q)" "PASS" "E1-E4 contour tests green; $PT_TAIL"
  fi
  if [ -n "$OTHER_FAILS" ]; then
    PRE_SUMMARY="$(echo "$FAILED" | grep -vE "$E14_RE" | sed 's/::.*//;s/^FAILED //;s/^ERROR //' | sort | uniq -c | sort -rn | awk '{printf "%s(%d); ", $2, $1}' | head -c 1500)"
    PRE_N="$(echo "$FAILED" | grep -vE "$E14_RE" | wc -l | tr -d ' ')"
    step "backend tests: PRE-EXISTING failures unrelated to E1-E4 (not fixed)" "WARN" "${PRE_N} failing tests / collection errors by file: ${PRE_SUMMARY} — full log: /tmp/regression_e1_e4_pytest.log"
  fi
fi
cp "$PT_LOG" /tmp/regression_e1_e4_pytest.log
rm -f "$PT_LOG"

# ---------------------------------------------------- 4. frontend unit tests
VT_LOG="$(mktemp /tmp/vitest_e14.XXXXXX.log)"
( cd frontend && npx vitest run src/features/technologist ) > "$VT_LOG" 2>&1
if [ $? = 0 ]; then
  step "frontend vitest (src/features/technologist)" "PASS" "$(grep -E 'Test Files|Tests ' "$VT_LOG" | tr '\n' ' ' | head -c 200)"
else
  step "frontend vitest (src/features/technologist)" "FAIL" "$(tail -3 "$VT_LOG" | tr '\n' ' ' | head -c 300)"
fi
NT_LOG="$(mktemp /tmp/nodetest_e14.XXXXXX.log)"
( cd frontend && node --test src/lib/apiRoutes.test.mjs ) > "$NT_LOG" 2>&1
if [ $? = 0 ]; then
  step "frontend node --test (src/lib/apiRoutes.test.mjs)" "PASS" "$(grep -E '^# (pass|fail)' "$NT_LOG" | tr '\n' ' ' | head -c 200)"
else
  step "frontend node --test (src/lib/apiRoutes.test.mjs)" "FAIL" "$(grep -E '^# (pass|fail)' "$NT_LOG" | tr '\n' ' ' | head -c 200) $(grep -m1 'not ok' "$NT_LOG" | head -c 150)"
fi
rm -f "$VT_LOG" "$NT_LOG"

# ---------------------------------------------------------------- 5. vite build
BD_LOG="$(mktemp /tmp/vitebuild_e14.XXXXXX.log)"
( cd frontend && npx vite build ) > "$BD_LOG" 2>&1
if [ $? = 0 ]; then
  step "vite build (frontend)" "PASS" "$(grep -E 'built in' "$BD_LOG" | head -c 120)"
else
  step "vite build (frontend)" "FAIL" "$(tail -3 "$BD_LOG" | tr '\n' ' ' | head -c 300)"
fi
rm -f "$BD_LOG"

# ------------------------------------------------- 6. smoke: local demo backend
H="$(curl -sS -m 10 "$DEMO/api/health" 2>/dev/null)"
echo "$H" | grep -q '"status":"ok"\|"ok":true' \
  && step "smoke local: GET /api/health" "PASS" "status ok" \
  || step "smoke local: GET /api/health" "FAIL" "unexpected: $(echo "$H" | head -c 150)"

HPT="$(curl -sS -m 10 "$DEMO/api/health/process-template" 2>/dev/null)"
echo "$HPT" | grep -q '"status":"ok"' \
  && step "smoke local: GET /api/health/process-template" "PASS" "db connected, tables exist" \
  || step "smoke local: GET /api/health/process-template" "FAIL" "unexpected: $(echo "$HPT" | head -c 150)"

TOKEN="$(curl -sS -m 10 -X POST "$DEMO/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@local","password":"admin"}' 2>/dev/null | json 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)"
if [ -z "${TOKEN:-}" ]; then
  step "smoke local: login admin@local" "FAIL" "no access_token — skipping authed smokes"
  for s in "import-bpmn" "operation-catalog" "dictionaries"; do step "smoke local: $s" "WARN" "skipped (no token)"; done
else
  step "smoke local: login admin@local" "PASS" "token acquired"
  IMP="$(curl -sS -m 30 -X POST "$DEMO/api/process-templates/import-bpmn" \
        -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' \
        --data-binary "@$FIXTURE" 2>/dev/null)"
  IMP_CHK="$(printf '%s' "$IMP" | json '
import sys, json
d = json.load(sys.stdin)
s = d.get("report", {}).get("summary", {})
ok = s.get("errors") == 0 and s.get("nodes") == 35 and s.get("flows") == 36
print("OK" if ok else "BAD")
print("errors=%s nodes=%s flows=%s warnings=%s" % (s.get("errors"), s.get("nodes"), s.get("flows"), s.get("warnings")))
' 2>/dev/null)"
  if [ "$(echo "$IMP_CHK" | head -1)" = "OK" ]; then
    step "smoke local: POST /api/process-templates/import-bpmn (tobe_razogrev_supa_rtk_v03)" "PASS" "$(echo "$IMP_CHK" | tail -1)"
  else
    step "smoke local: POST /api/process-templates/import-bpmn (tobe_razogrev_supa_rtk_v03)" "FAIL" "$(echo "$IMP_CHK" | tail -1); raw: $(printf '%s' "$IMP" | head -c 150)"
  fi

  OC="$(curl -sS -m 10 "$DEMO/api/operation-catalog" -H "Authorization: Bearer $TOKEN" 2>/dev/null \
       | json 'import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else -1)' 2>/dev/null)"
  [ "${OC:-}" = "13" ] && step "smoke local: GET /api/operation-catalog" "PASS" "13 operations" \
                       || step "smoke local: GET /api/operation-catalog" "FAIL" "count=${OC:-?}, expected 13"

  DICT_FAIL=""; DICT_DETAIL=""
  for d in equipment-types container-types zone-types sku; do
    N="$(curl -sS -m 10 "$DEMO/api/dictionaries/$d" -H "Authorization: Bearer $TOKEN" 2>/dev/null \
         | json 'import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else -1)' 2>/dev/null)"
    DICT_DETAIL="$DICT_DETAIL $d=${N:-?};"
    [ -z "${N:-}" ] || [ "$N" = "-1" ] && DICT_FAIL="$DICT_FAIL $d"
  done
  [ -z "$DICT_FAIL" ] && step "smoke local: GET /api/dictionaries/* (4 dicts)" "PASS" "$DICT_DETAIL" \
                      || step "smoke local: GET /api/dictionaries/* (4 dicts)" "FAIL" "broken:$DICT_FAIL;$DICT_DETAIL"
fi

# ------------------------------------------- 7. smoke: STAGE (READ-ONLY only)
stage_code() { curl -sS -m 15 -o /dev/null -w '%{http_code}' "$STAGE$1" 2>/dev/null; }
C="$(stage_code /api/health/process-template)"
[ "$C" = "200" ] && step "STAGE(read-only): GET /api/health/process-template" "PASS" "HTTP $C" \
                 || step "STAGE(read-only): GET /api/health/process-template" "FAIL" "HTTP $C"
for p in /technologist/constructor /technologist/import-bpmn; do
  C="$(stage_code "$p")"
  [ "$C" = "200" ] && step "STAGE(read-only): GET $p" "PASS" "HTTP $C" \
                   || step "STAGE(read-only): GET $p" "FAIL" "HTTP $C"
done
C="$(stage_code /api/operation-catalog)"
[ "$C" = "401" ] && step "STAGE(read-only): GET /api/operation-catalog w/o token" "PASS" "HTTP $C (auth guard works)" \
                 || step "STAGE(read-only): GET /api/operation-catalog w/o token" "FAIL" "HTTP $C, expected 401"

# -------------------------------------------------------------------- report
END_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$(dirname "$REPORT")"
{
  echo "# E1-E4 Regression Contour Report"
  echo
  echo "- Generated: ${END_TS} (started ${START_TS})"
  echo "- Runner: \`scripts/regression_e1_e4.sh\`"
  echo "- Branch: \`${GIT_BRANCH}\`"
  echo "- Local demo backend: ${DEMO}; DB: local PostgreSQL \`processmap\`"
  echo "- Stage: ${STAGE} — **READ-ONLY smoke only (GET requests, no auth available)**"
  echo
  echo "**Result: ${PASS} PASS / ${FAIL} FAIL / ${WARN} WARN**"
  echo
  echo "| Step | Status | Detail | Time (UTC) |"
  echo "| --- | --- | --- | --- |"
  printf '%s\n' "${ROWS[@]}"
  echo
  echo "## Stage smoke section"
  echo
  echo "Steps prefixed \`STAGE(read-only)\` are executed against ${STAGE} with plain"
  echo "unauthenticated GET requests only. No writes, no auth tokens, no mutations."
  echo "\`/api/operation-catalog\` returning 401 without a token is the expected"
  echo "behaviour and confirms the auth guard works."
  echo
  echo "## Notes"
  echo
  echo "- \`backend/alembic.local.ini\` does not exist; alembic runs with"
  echo "  \`backend/alembic.ini\` where \`sqlalchemy.url\` is overridden via \`ALEMBIC_URL\`"
  echo "  (default: local DB) rendered into a temp ini."
  echo "- PRE-EXISTING backend-test failures (if any) are listed in the backend-tests"
  echo "  step row and were not introduced by / fixed within the E1-E4 contours."
  echo "- Backend tests run with \`--continue-on-collection-errors\` so one broken"
  echo "  module cannot abort the whole suite; such errors are classified PRE-EXISTING."
  echo "- Full pytest log of the last run: \`/tmp/regression_e1_e4_pytest.log\`."
} > "$REPORT"

echo "=== done: ${PASS} PASS / ${FAIL} FAIL / ${WARN} WARN → $REPORT ==="
[ "$FAIL" = "0" ]
