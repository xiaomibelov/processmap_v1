#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  diagram_jazz_tuple_preflight.sh \
    --org <org_id> \
    --project <project_id> \
    --session <session_id> \
    --operator <operator_user_id> \
    --provider <provider> \
    --allowlist <csv_allowlist> \
    [--postgres-container <container_name>]

Description:
  Fail-closed preflight probe for Diagram->Jazz candidate tuple readiness.
  Required checks:
  - mapping_exists
  - payload_exists
  - mapping/provider/scope validity
  - allowlist exact match (operator-locked tuple)
USAGE
}

ORG_ID=""
PROJECT_ID=""
SESSION_ID=""
OPERATOR_ID=""
PROVIDER="zeebe"
ALLOWLIST=""
POSTGRES_CONTAINER="foodproc_process_copilot-postgres-1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)
      ORG_ID="${2:-}"; shift 2 ;;
    --project)
      PROJECT_ID="${2:-}"; shift 2 ;;
    --session)
      SESSION_ID="${2:-}"; shift 2 ;;
    --operator)
      OPERATOR_ID="${2:-}"; shift 2 ;;
    --provider)
      PROVIDER="${2:-}"; shift 2 ;;
    --allowlist)
      ALLOWLIST="${2:-}"; shift 2 ;;
    --postgres-container)
      POSTGRES_CONTAINER="${2:-}"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 64 ;;
  esac
done

if [[ -z "$ORG_ID" || -z "$PROJECT_ID" || -z "$SESSION_ID" || -z "$OPERATOR_ID" || -z "$PROVIDER" || -z "$ALLOWLIST" ]]; then
  echo "missing_required_arguments" >&2
  usage
  exit 64
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq "$POSTGRES_CONTAINER"; then
  echo '{"ok":false,"reason":"postgres_container_not_running"}'
  exit 2
fi

scope_id="${ORG_ID}::${PROJECT_ID}::${SESSION_ID}"
operator_tuple="${scope_id}@${OPERATOR_ID}"

allowlist_match="false"
IFS=',' read -r -a entries <<< "$ALLOWLIST"
for raw in "${entries[@]}"; do
  item="$(echo "$raw" | tr -d '[:space:]')"
  if [[ "$item" == "$operator_tuple" ]]; then
    allowlist_match="true"
    break
  fi
done

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

ORG_SQL="$(sql_escape "$ORG_ID")"
PROJECT_SQL="$(sql_escape "$PROJECT_ID")"
SESSION_SQL="$(sql_escape "$SESSION_ID")"

mapping_row="$(docker exec "$POSTGRES_CONTAINER" psql -U fpc -d processmap -Atc "
select mapping_id || '|' || doc_id || '|' || provider || '|' || scope_id
from diagram_jazz_mappings
where org_id='${ORG_SQL}' and project_id='${PROJECT_SQL}' and session_id='${SESSION_SQL}'
limit 1;")"

mapping_exists="false"
mapping_provider_valid="false"
mapping_scope_valid="false"
doc_id=""
mapping_id=""
mapping_provider=""
mapping_scope=""

if [[ -n "$mapping_row" ]]; then
  mapping_exists="true"
  IFS='|' read -r mapping_id doc_id mapping_provider mapping_scope <<< "$mapping_row"
  if [[ "$mapping_provider" == "$PROVIDER" ]]; then
    mapping_provider_valid="true"
  fi
  if [[ "$mapping_scope" == "$scope_id" ]]; then
    mapping_scope_valid="true"
  fi
fi

payload_exists="false"
document_exists="false"
doc_provider_valid="false"
doc_scope_valid="false"
bpmn_len=0
payload_updated_at=0
stored_revision=0
stored_fingerprint=""

if [[ -n "$doc_id" ]]; then
  DOC_SQL="$(sql_escape "$doc_id")"
  document_row="$(docker exec "$POSTGRES_CONTAINER" psql -U fpc -d processmap -Atc "
select doc_id || '|' || provider || '|' || scope_id || '|' || coalesce(length(bpmn_xml),0) || '|' || coalesce(payload_updated_at,0) || '|' || coalesce(revision,0) || '|' || coalesce(fingerprint,'')
from diagram_jazz_documents
where doc_id='${DOC_SQL}'
limit 1;")"

  if [[ -n "$document_row" ]]; then
    document_exists="true"
    IFS='|' read -r _doc_id doc_provider doc_scope bpmn_len payload_updated_at stored_revision stored_fingerprint <<< "$document_row"
    if [[ "$doc_provider" == "$PROVIDER" ]]; then
      doc_provider_valid="true"
    fi
    if [[ "$doc_scope" == "$scope_id" ]]; then
      doc_scope_valid="true"
    fi
    if [[ "$bpmn_len" -gt 0 ]]; then
      payload_exists="true"
    fi
  fi
fi

mapping_payload_ready="false"
if [[ "$mapping_exists" == "true" && "$payload_exists" == "true" && "$mapping_provider_valid" == "true" && "$mapping_scope_valid" == "true" && "$doc_provider_valid" == "true" && "$doc_scope_valid" == "true" ]]; then
  mapping_payload_ready="true"
fi

candidate_ready="false"
if [[ "$allowlist_match" == "true" && "$mapping_payload_ready" == "true" ]]; then
  candidate_ready="true"
fi

reasons=()
[[ "$allowlist_match" == "true" ]] || reasons+=("allowlist_mismatch")
[[ "$mapping_exists" == "true" ]] || reasons+=("diagram_jazz_mapping_missing")
[[ "$mapping_provider_valid" == "true" ]] || reasons+=("diagram_jazz_mapping_provider_mismatch")
[[ "$mapping_scope_valid" == "true" ]] || reasons+=("diagram_jazz_mapping_scope_mismatch")
[[ "$document_exists" == "true" ]] || reasons+=("diagram_jazz_document_missing")
[[ "$payload_exists" == "true" ]] || reasons+=("diagram_jazz_payload_missing")
[[ "$doc_provider_valid" == "true" ]] || reasons+=("diagram_jazz_document_provider_mismatch")
[[ "$doc_scope_valid" == "true" ]] || reasons+=("diagram_jazz_document_scope_mismatch")

if [[ ${#reasons[@]} -eq 0 ]]; then
  reason_csv=""
else
  reason_csv="$(IFS=','; echo "${reasons[*]}")"
fi

printf '{"ok":%s,"candidate_ready":%s,"scope_id":"%s","operator_tuple":"%s","provider":"%s","allowlist_match":%s,"mapping_exists":%s,"payload_exists":%s,"mapping_provider_valid":%s,"mapping_scope_valid":%s,"document_exists":%s,"document_provider_valid":%s,"document_scope_valid":%s,"mapping_payload_ready":%s,"mapping_id":"%s","doc_id":"%s","stored_revision":%s,"stored_fingerprint":"%s","bpmn_length":%s,"payload_updated_at":%s,"blocked_reasons":"%s"}\n' \
  "$candidate_ready" "$candidate_ready" "$scope_id" "$operator_tuple" "$PROVIDER" "$allowlist_match" "$mapping_exists" "$payload_exists" "$mapping_provider_valid" "$mapping_scope_valid" "$document_exists" "$doc_provider_valid" "$doc_scope_valid" "$mapping_payload_ready" "$mapping_id" "$doc_id" "$stored_revision" "$stored_fingerprint" "$bpmn_len" "$payload_updated_at" "$reason_csv"

if [[ "$candidate_ready" == "true" ]]; then
  exit 0
fi
exit 2
