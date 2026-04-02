#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)"
set -euo pipefail

TARGET="frontend/src/components/process/BpmnStage.jsx"

echo "== BpmnStage Step1 Preflight =="
echo "repo_root: $(pwd)"
echo

echo "== Git Context =="
echo "branch: $(git rev-parse --abbrev-ref HEAD)"
echo "head_short: $(git rev-parse --short HEAD)"
echo "head_full: $(git rev-parse HEAD)"
echo
git status -sb
echo
echo "stash_top10:"
git stash list | sed -n '1,10p'
echo

echo "== File Metrics =="
wc -l "$TARGET"
echo "useRef_count: $( (rg -o '\buseRef\b' "$TARGET" || true) | wc -l | tr -d ' ' )"
echo "useEffect_count: $( (rg -o '\buseEffect\b' "$TARGET" || true) | wc -l | tr -d ' ' )"
echo "catch_count: $( (rg -o '\bcatch\b' "$TARGET" || true) | wc -l | tr -d ' ' )"
echo

echo "== Exports =="
rg -n '^export ' "$TARGET" || true
echo

echo "== Props Contract Snippet (component signature) =="
sed -n '1167,1190p' "$TARGET"
echo

echo "== useImperativeHandle Methods (public imperative API) =="
awk '
  /useImperativeHandle\(ref, \(\) => \{/ { in_block=1; next }
  in_block && /^  }\);$/ { in_block=0 }
  in_block && /^      [A-Za-z_][A-Za-z0-9_]*:[[:space:]]/ {
    line=$0
    sub(/^      /, "", line)
    sub(/:.*/, "", line)
    print line
  }
' "$TARGET" | nl -ba
