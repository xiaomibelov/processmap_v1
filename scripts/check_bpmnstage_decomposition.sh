cd "$(git rev-parse --show-toplevel)" || return

echo "== repo =="
git status -sb
echo "Branch: $(git branch --show-current)"
echo "HEAD:   $(git rev-parse --short HEAD)"
echo

FILE="frontend/src/components/process/BpmnStage.jsx"
if [ -f "$FILE" ]; then
  echo "BpmnStage.jsx lines:"
  wc -l "$FILE"
  echo
fi

echo "== expected extracted modules =="
for f in \
  frontend/src/features/process/bpmn/stage/playbackAdapter.js \
  frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js \
  frontend/src/features/process/bpmn/stage/ops/commandOpsAdapter.js \
  frontend/src/features/process/bpmn/stage/ai/aiQuestionPanelAdapter.js \
  frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js
do
  if [ -f "$f" ]; then
    echo "OK  $f"
  else
    echo "MISS $f"
  fi
done
echo

echo "== decomposition tags (latest) =="
git tag --list 'cp/bpmnstage_*' --sort=-creatordate | head -n 20 || true
echo
