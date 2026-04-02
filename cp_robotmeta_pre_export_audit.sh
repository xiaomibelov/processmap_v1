#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%Y%m%d_%H%M%S)"
TAG="cp/robotmeta_pre_export_audit_${TS}"
git tag -a "${TAG}" -m "Checkpoint before RobotMeta BPMN export audit."
echo "Tagged: ${TAG}"
echo

OUT="docs/robotmeta_pre_export_audit_${TS}.md"
mkdir -p docs

BR="$(git branch --show-current)"
HEAD="$(git rev-parse --short HEAD)"

{
  echo "# RobotMeta pre-export audit (${TS})"
  echo
  echo "- branch: ${BR}"
  echo "- head: ${HEAD}"
  echo

  echo "## Commit content (HEAD)"
  echo '```'
  git show --name-only --oneline --no-patch HEAD
  echo '```'
  echo
  echo "### Files changed in HEAD commit"
  echo '```'
  git show --name-only --pretty="" HEAD | sed '/^$/d' || true
  echo '```'
  echo

  echo "## Tracked/untracked status"
  echo '```'
  git status -sb
  echo '```'
  echo

  echo "## Where robot meta is stored / used"
  echo "### Grep: robot_meta_by_element_id"
  echo '```'
  rg -n "robot_meta_by_element_id" frontend backend || true
  echo '```'
  echo

  echo "### Grep: RobotMeta editor UI entrypoints"
  echo '```'
  rg -n "Robot Meta|robotmeta|RobotMeta" frontend/src/components frontend/src/features || true
  echo '```'
  echo

  echo "## BPMN runtime/persistence hooks (candidates)"
  echo "### Grep: moddleExtensions / createBpmnRuntime / saveXML"
  echo '```'
  rg -n "moddleExtensions|createBpmnRuntime|saveXML\\(|importXML\\(|createBpmnPersistence" frontend/src || true
  echo '```'
  echo

  echo "## API usage for session save/persist"
  echo "### Grep: PATCH/PUT session save / bpmn persistence"
  echo '```'
  rg -n "PATCH .*sessions|PUT .*bpmn|/api/sessions|bpmn_meta" frontend/src backend || true
  echo '```'
  echo

  echo "## Backend endpoints sanity (if backend exists in repo)"
  echo "### Grep: sessions routes / reports routes"
  echo '```'
  rg -n "api/sessions|@app\\.(get|post|patch|delete)\\(\"/api/sessions|router\\.(get|post|patch|delete)\\(\"/api/sessions" backend || true
  echo '```'
  echo

  echo "## Conclusion checklist"
  echo "- [ ] Backend реально изменялся под robot_meta (есть ли backend/app/main.py в коммите?)"
  echo "- [ ] Единственный source of truth robot_meta (frontend session meta vs backend normalize)"
  echo "- [ ] Точка перед saveXML, куда встраивать syncRobotMetaToBpmn()"
  echo "- [ ] Точка инициализации bpmn-js, куда добавить moddleExtensions.pm"
} > "${OUT}"

echo "Wrote: ${OUT}"
ls -la "${OUT}" | sed 's/^/  /'
