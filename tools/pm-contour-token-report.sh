#!/usr/bin/env bash
set -euo pipefail

ROOT="${PROCESSMAP_ROOT:-/opt/processmap-test}"
CONTOURS_DIR="$ROOT/.planning/contours"
RUN_STATE_DIR="$ROOT/.agents/run-state"
MAX_FILE_BYTES="${PROCESSMAP_TOKEN_REPORT_MAX_FILE_BYTES:-2097152}"
MODE="summary"
CID_FILTER=""
INCLUDE_LARGE=0

export LC_ALL=C

usage() {
  cat <<'EOF'
Usage:
  tools/pm-contour-token-report.sh [contour-id]
  tools/pm-contour-token-report.sh --all
  tools/pm-contour-token-report.sh --csv [contour-id|--all]
  PROCESSMAP_TOKEN_REPORT_MAX_FILE_BYTES=10485760 tools/pm-contour-token-report.sh --all

Reports approximate token counts per ProcessMap contour.

Fields:
  artifact_tokens_est - approximate tokens in contour files, chars / 4
  log_tokens_est      - approximate tokens in matching agent logs, chars / 4
  total_tokens_est    - artifact + log estimate
  peak_context_tokens - max "context: ... (N/limit)" observed in agent logs
  max_visible_tokens  - max visible "N tokens" progress counter observed in logs

Notes:
  This is not API billing. It is an operational estimate from local artifacts and terminal logs.
  It does not print file contents or secrets.
  By default, contour artifacts larger than 2 MiB are skipped so generated indexes
  and captures do not dominate the report. Use --include-large to count them.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --all)
      CID_FILTER=""
      ;;
    --csv)
      MODE="csv"
      ;;
    --include-large)
      INCLUDE_LARGE=1
      ;;
    --summary)
      MODE="summary"
      ;;
    *)
      if [ -n "$CID_FILTER" ]; then
        echo "ERROR: only one contour id may be supplied." >&2
        exit 2
      fi
      CID_FILTER="$1"
      ;;
  esac
  shift
done

if [ ! -d "$CONTOURS_DIR" ]; then
  echo "ERROR: contours directory not found: $CONTOURS_DIR" >&2
  exit 1
fi

awk_script='
function ceil(n) { return int(n) == n ? n : int(n) + 1 }
function parse_count(raw,   v) {
  gsub(/,/, "", raw)
  if (raw ~ /[kK]$/) {
    v = raw
    sub(/[kK]$/, "", v)
    return int((v + 0) * 1000)
  }
  return int(raw + 0)
}
function scan_log(path, cid,   line, ctx_match, gen_match, ctx_tokens, gen_tokens) {
  while ((getline line < path) > 0) {
    if (match(line, /context:[^\(]*\(([0-9.]+[kK]?)[[:space:]]*\//, ctx_match)) {
      ctx_tokens = parse_count(ctx_match[1])
      if (ctx_tokens > peak_context[cid]) peak_context[cid] = ctx_tokens
    }
    if (match(line, /·[[:space:]]*([0-9.]+[kK]?)[[:space:]]+tokens/, gen_match)) {
      gen_tokens = parse_count(gen_match[1])
      if (gen_tokens > max_visible[cid]) max_visible[cid] = gen_tokens
    }
  }
  close(path)
}
BEGIN { FS = "\t" }
$1 == "artifact" {
  cid = $2
  bytes = $3 + 0
  artifact_files[cid] += 1
  artifact_bytes[cid] += bytes
  seen[cid] = 1
  next
}
$1 == "skipped_artifact" {
  cid = $2
  bytes = $3 + 0
  skipped_files[cid] += 1
  skipped_bytes[cid] += bytes
  seen[cid] = 1
  next
}
$1 == "log" {
  cid = $2
  path = $3
  bytes = $4 + 0
  log_files[cid] += 1
  log_bytes[cid] += bytes
  seen[cid] = 1
  scan_log(path, cid)
  next
}
END {
  for (cid in seen) {
    artifact_tokens = ceil(artifact_bytes[cid] / 4)
    log_tokens = ceil(log_bytes[cid] / 4)
    total_tokens = artifact_tokens + log_tokens
    printf "%s\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\n",
      cid,
      artifact_files[cid] + 0,
      artifact_bytes[cid] + 0,
      artifact_tokens,
      log_files[cid] + 0,
      log_bytes[cid] + 0,
      log_tokens,
      total_tokens,
      peak_context[cid] + 0,
      max_visible[cid] + 0,
      skipped_files[cid] + 0,
      skipped_bytes[cid] + 0
  }
}
'

emit_artifact_line() {
  cid="$1"
  size="$2"
  path="$3"
  if [ "$INCLUDE_LARGE" != "1" ] && [ "$size" -gt "$MAX_FILE_BYTES" ]; then
    printf 'skipped_artifact\t%s\t%s\t%s\n' "$cid" "$size" "$path"
  else
    printf 'artifact\t%s\t%s\t%s\n' "$cid" "$size" "$path"
  fi
}

emit_inventory() {
  if [ -n "$CID_FILTER" ]; then
    contour_path="$CONTOURS_DIR/$CID_FILTER"
    if [ ! -d "$contour_path" ]; then
      echo "ERROR: contour not found: $CID_FILTER" >&2
      exit 1
    fi
    find "$contour_path" -type f -printf '%s\t%p\n' | while IFS="$(printf '\t')" read -r size path; do
      emit_artifact_line "$CID_FILTER" "$size" "$path"
    done
  else
    find "$CONTOURS_DIR" -mindepth 2 -type f -printf '%p\t%s\n' | while IFS="$(printf '\t')" read -r path size; do
      rel="${path#"$CONTOURS_DIR"/}"
      family="${rel%%/*}"
      rest="${rel#*/}"
      contour="${rest%%/*}"
      [ -n "$family" ] && [ -n "$contour" ] || continue
      emit_artifact_line "$family/$contour" "$size" "$path"
    done
  fi

  if [ -d "$RUN_STATE_DIR" ]; then
    find "$RUN_STATE_DIR" -mindepth 2 -maxdepth 2 -type f -name '*.log' -printf '%h\t%p\t%s\n' | while IFS="$(printf '\t')" read -r run_dir log_path size; do
      cid_file="$run_dir/CID"
      [ -f "$cid_file" ] || continue
      cid="$(sed -n '1p' "$cid_file" 2>/dev/null || true)"
      [ -n "$cid" ] || continue
      if [ -n "$CID_FILTER" ] && [ "$cid" != "$CID_FILTER" ]; then
        continue
      fi
      printf 'log\t%s\t%s\t%s\n' "$cid" "$log_path" "$size"
    done
  fi
}

report_tsv="$(mktemp)"
trap 'rm -f "$report_tsv"' EXIT

emit_inventory | awk "$awk_script" | sort -t "$(printf '\t')" -k8,8nr > "$report_tsv"

if [ "$MODE" = "csv" ]; then
  printf 'contour,artifact_files,artifact_bytes,artifact_tokens_est,log_files,log_bytes,log_tokens_est,total_tokens_est,peak_context_tokens,max_visible_tokens,skipped_artifact_files,skipped_artifact_bytes\n'
  awk -F '\t' '{
    gsub(/"/, "\"\"", $1)
    printf "\"%s\",%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d\n", $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  }' "$report_tsv"
else
  printf '%-72s %7s %10s %10s %7s %10s %10s %10s %10s %10s %7s %10s\n' \
    "contour" "files" "art_tok" "log_tok" "logs" "total" "ctx_peak" "vis_max" "art_MB" "log_MB" "skip" "skip_MB"
  awk -F '\t' '{
    printf "%-72s %7d %10d %10d %7d %10d %10d %10d %10.2f %10.2f %7d %10.2f\n",
      $1, $2, $4, $7, $5, $8, $9, $10, $3 / 1048576, $6 / 1048576, $11, $12 / 1048576
  }' "$report_tsv"
fi
