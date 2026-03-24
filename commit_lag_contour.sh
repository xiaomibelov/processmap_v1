cd /Users/mac/PycharmProjects/processmap_clean_status_fix_v1 || { echo "repo dir not found"; false; }
set -euo pipefail

ts="$(date +%Y%m%d_%H%M%S)"
git tag "cp/lag_contour_commit_${ts}" || true

echo "== HEAD =="
git rev-parse --short HEAD
git status -sb

echo
echo "== staged manifest =="
git diff --cached --name-status
echo
git diff --cached --stat

echo
echo "== contamination recheck =="
cached_patch="$(git diff --cached)"
printf "%s" "$cached_patch" | grep -nE 'diagramJazz|apiGetDiagramJazz|syncVersionToken|acknowledgedRev|fallbackAck|captureRealtime|recovery|backend/' && {
  echo "contamination detected in staged diff"
  false
} || true

echo
echo "== commit =="
git commit -m "perf(bpmn): extract LocalMutationStaging and thin client-side settled fanout" -m "- Extract LocalMutationStaging from coordinator and remove canonical formatted XML export from interactive staging; durable flush remains the only formatted XML authority
- Split post-staging fanout into immediate and settled lanes
- Coalesce bpmnWiring store -> React setter fanout for xml/xmlDraft/dirty
- Guard settled stepTime decor to skip redundant clear+rebuild on unchanged payload/unit
- Keep rollback autosave/runtime behavior stable with no stale/reload/jump-back regression"

echo
echo "== result =="
git rev-parse --short HEAD
git status -sb
