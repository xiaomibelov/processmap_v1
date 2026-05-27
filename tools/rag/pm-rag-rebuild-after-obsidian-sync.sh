#!/usr/bin/env bash
set -euo pipefail

ROOT="${PROCESSMAP_ROOT:-/opt/processmap-test}"
OBSIDIAN_ROOT="${PROCESSMAP_OBSIDIAN_ROOT:-/srv/obsidian/project-atlas/ProcessMap}"
OUT_DIR="${PROCESSMAP_RAG_OUTPUT_DIR:-$ROOT/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1}"
WORK_BASE="${PROCESSMAP_RAG_WORK_DIR:-$ROOT/.agents/rag-index}"
DEBOUNCE_SECONDS="${PROCESSMAP_RAG_REBUILD_DEBOUNCE_SECONDS:-60}"
NON_OBSIDIAN_BUDGET="${PROCESSMAP_RAG_REBUILD_NON_OBSIDIAN_BUDGET:-1641}"
FORCE="${PROCESSMAP_RAG_REBUILD_FORCE:-0}"

MANIFEST_BUILDER="$ROOT/tools/rag/pm-rag-build-manifest.mjs"
INDEX_BUILDER="$ROOT/tools/rag/pm-rag-build-search-index.mjs"
INDEX_JSON="$OUT_DIR/RAG_SEARCH_INDEX_BALANCED.json"
MANIFEST_JSON="$OUT_DIR/RAG_MANIFEST_BALANCED.json"

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

latest_obsidian_mtime() {
  find "$OBSIDIAN_ROOT" \
    -path '*/_Imported/*' -prune -o \
    -type f -name '*.md' -printf '%T@\n' 2>/dev/null \
    | awk 'BEGIN { max = 0 } { if ($1 > max) max = $1 } END { printf "%d\n", max }'
}

obsidian_md_count() {
  find "$OBSIDIAN_ROOT" \
    -path '*/_Imported/*' -prune -o \
    -type f -name '*.md' -print 2>/dev/null \
    | wc -l \
    | tr -d ' '
}

json_field() {
  local file="$1"
  local expr="$2"
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const v=($expr); console.log(v == null ? '' : v)" "$file"
}

mkdir -p "$WORK_BASE" "$OUT_DIR"
exec 9>"$WORK_BASE/rebuild.lock"
if ! flock -n 9; then
  log "skip: another RAG rebuild is already running"
  exit 0
fi

if [ ! -d "$ROOT" ]; then
  log "error: missing ROOT=$ROOT"
  exit 2
fi
if [ ! -d "$OBSIDIAN_ROOT" ]; then
  log "error: missing OBSIDIAN_ROOT=$OBSIDIAN_ROOT"
  exit 2
fi
if [ ! -f "$MANIFEST_BUILDER" ] || [ ! -f "$INDEX_BUILDER" ]; then
  log "error: missing RAG builders under $ROOT/tools/rag"
  exit 2
fi

if [ "$DEBOUNCE_SECONDS" -gt 0 ] 2>/dev/null; then
  log "debounce: sleeping ${DEBOUNCE_SECONDS}s before checking Obsidian"
  sleep "$DEBOUNCE_SECONDS"
fi

latest_mtime="$(latest_obsidian_mtime || true)"
latest_mtime="${latest_mtime:-0}"
index_mtime="0"
if [ -f "$INDEX_JSON" ]; then
  index_mtime="$(stat -c %Y "$INDEX_JSON" 2>/dev/null || echo 0)"
fi

count="$(obsidian_md_count || true)"
count="${count:-0}"
if [ "$count" -le 0 ] 2>/dev/null; then
  log "error: no Obsidian markdown files visible under $OBSIDIAN_ROOT"
  exit 2
fi

if [ "$FORCE" != "1" ] && [ "$index_mtime" -ge "$latest_mtime" ] 2>/dev/null; then
  log "skip: index is current; obsidian_md=$count index_mtime=$index_mtime latest_obsidian_mtime=$latest_mtime"
  exit 0
fi

limit="$((count + NON_OBSIDIAN_BUDGET))"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$WORK_BASE/work-$timestamp"
mkdir -p "$work_dir"

log "start: rebuilding RAG index; obsidian_md=$count limit=$limit min_per_source=$count"
log "work_dir=$work_dir"

cd "$ROOT"
nice -n 10 node "$MANIFEST_BUILDER" \
  --limit "$limit" \
  --min-per-source "$count" \
  --output-dir "$work_dir"

nice -n 10 node "$INDEX_BUILDER" \
  --manifest "$work_dir/RAG_MANIFEST_BALANCED.json" \
  --output-dir "$work_dir"

node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const index = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const coverage = Object.fromEntries((manifest.coverage || []).map((row) => [row.source_id, row]));
if (!coverage['project-atlas']) throw new Error('project-atlas coverage missing');
if (Number(coverage['project-atlas'].files_included || 0) < Number(process.argv[3])) {
  throw new Error('project-atlas coverage below visible Obsidian markdown count');
}
if (!Array.isArray(index.chunks) || index.chunks.length <= 0) throw new Error('empty search index');
" "$work_dir/RAG_MANIFEST_BALANCED.json" "$work_dir/RAG_SEARCH_INDEX_BALANCED.json" "$count"

mv -f "$work_dir/RAG_MANIFEST_BALANCED.json" "$OUT_DIR/RAG_MANIFEST_BALANCED.json"
mv -f "$work_dir/RAG_MANIFEST_BALANCED.md" "$OUT_DIR/RAG_MANIFEST_BALANCED.md"
mv -f "$work_dir/RAG_SEARCH_INDEX_BALANCED.json" "$OUT_DIR/RAG_SEARCH_INDEX_BALANCED.json"
mv -f "$work_dir/RAG_SEARCH_INDEX_BALANCED.md" "$OUT_DIR/RAG_SEARCH_INDEX_BALANCED.md"

chunks="$(json_field "$INDEX_JSON" "j.total_chunks || (j.chunks || []).length")"
generated="$(json_field "$INDEX_JSON" "j.generated")"
included="$(json_field "$MANIFEST_JSON" "((j.coverage || []).find((row) => row.source_id === 'project-atlas') || {}).files_included")"
total="$(json_field "$MANIFEST_JSON" "j.total_files")"

log "done: generated=$generated chunks=$chunks manifest_files=$total project_atlas_included=$included/$count"

find "$WORK_BASE" -maxdepth 1 -type d -name 'work-*' -mtime +2 -exec rm -rf {} + 2>/dev/null || true
