# RobotMeta BPMN export implementation

- date: 2026-03-01
- branch: feat/robotmeta-v1

## Preflight

Read source audit: `docs/robotmeta_pre_export_audit_20260301_152202.md` (latest available file by pattern).

### 1) Where `robot_meta_by_element_id` is stored

Single source of truth is **session meta** (`draft.bpmn_meta.robot_meta_by_element_id`), not XML.

- Merge and priority logic: `frontend/src/App.jsx:564-612`
- Session-meta write path from UI Robot Meta editor: `frontend/src/App.jsx:2361-2460`
- Local cache/read normalization: `frontend/src/App.jsx:474-509`
- Backend persistent field in `bpmn_meta`: `backend/app/main.py:3769-3793`, `backend/app/main.py:3944-3982`

Priority when both XML and session meta have RobotMeta:

- `sessionToDraft(...)` reads both and logs mismatch, then uses session map as effective map (`frontend/src/App.jsx:590-612`).
- This keeps source-of-truth stable and prevents dual-write conflicts.

### 2) Where BPMN save/persist happens (`saveXML` / `PUT bpmn`)

- Before save: `saveLocalFromModeler(...)` in `frontend/src/components/process/BpmnStage.jsx:5556-5608`
- BPMN XML serialization: `runtime.getXml()` -> `inst.saveXML(...)` in `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js:269-291`
- Backend persist: `persistence.saveRaw(...)` in `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js:387-447`
- HTTP PUT endpoint call: `apiPutBpmnXml(...)` in `frontend/src/lib/api.js:876-897` -> `PUT /api/sessions/:id/bpmn`

### 3) Where bpmn-js runtime/modeler is created (for `moddleExtensions`)

- Modeler runtime init: `frontend/src/components/process/BpmnStage.jsx:1522-1533` (`createBpmnRuntime` with `moddleExtensions: { pm: pmModdleDescriptor }`)
- Viewer init: `frontend/src/components/process/BpmnStage.jsx:4519-4532` (`new NavigatedViewer` with same moddle extension)

## Implemented changes

### A) Moddle extension `pm`

- Descriptor kept with required contract and namespace:
  - `prefix: pm`
  - `uri: http://processmap.ai/schema/bpmn/1.0`
  - type `pm:RobotMeta`
  - properties: `version` attr + `json` body
- File: `frontend/src/features/process/robotmeta/pmModdleDescriptor.js`
- Removed `xml.tagAlias: lowerCase` so tag is serialized as `pm:RobotMeta` (not `pm:robotMeta`).

### B) Sync before `saveXML`

Added reusable sync function:

- `syncRobotMetaToBpmn({ modeler, robotMetaByElementId })`
- File: `frontend/src/features/process/robotmeta/robotMeta.js:351-430`

Behavior:

- For each candidate BPMN element (all map keys + elements already containing `pm:RobotMeta`):
  - create/update `bpmn:extensionElements` with single `pm:RobotMeta version="v1">{canonical-json}</pm:RobotMeta`
  - canonical JSON is one-line (`JSON.stringify(canonicalizeRobotMeta(...))`)
  - remove only `pm:RobotMeta` when source meta for element is absent
  - preserve all non-robot extension values (`camunda/zeebe/...`)
  - deduplicate by rewriting to exactly one `pm:RobotMeta`

Call site before `saveXML`:

- Wrapper in stage: `frontend/src/components/process/BpmnStage.jsx:2049-2054`
- Invocation in persistence path (before flush/saveXML): `frontend/src/components/process/BpmnStage.jsx:5581-5588`

No re-import is used; sync mutates businessObject diff-only in-memory before normal `saveXML` flow.

## Round-trip smoke

Automated E2E (preferred smoke for this repo):

- test file: `frontend/e2e/robotmeta-save-reload.spec.mjs`
- checks now include:
  - save robot meta in UI
  - force BPMN save by model mutation
  - `GET /api/sessions/:id/bpmn?raw=1` contains exactly one `<pm:RobotMeta ...>`
  - reload UI, values restored
  - second BPMN save keeps one `<pm:RobotMeta ...>` and same canonical JSON body

Latest local run: **passed**.

## XML fragment (real saved BPMN)

```xml
<bpmn:userTask id="Task_1" name="Robot Task qydog3 B">
  <bpmn:extensionElements>
    <pm:RobotMeta version="v1">{"exec":{"action_key":"robot.mix","executor":"node_red","mode":"machine","retry":{"backoff_sec":5,"max_attempts":3},"timeout_sec":45},"mat":{"from_zone":"cold","inputs":[],"outputs":[],"to_zone":"heat"},"qc":{"checks":[],"critical":true},"robot_meta_version":"v1"}</pm:RobotMeta>
  </bpmn:extensionElements>
  <bpmn:incoming>Flow_1</bpmn:incoming>
  <bpmn:outgoing>Flow_2</bpmn:outgoing>
</bpmn:userTask>
```
