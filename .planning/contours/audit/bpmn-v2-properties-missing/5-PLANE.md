# 5-PLANE — audit/bpmn-v2-properties-missing

| Plane | Status | Evidence |
|---|---|---|
| **Code** | ✅ Fixed | `NotesPanel.jsx` now merges live `businessObject.extensionElements` from the modeler with `bpmn_meta` state (`selectedCamundaExtensionEntry`), meta wins on name conflicts. `App.jsx:sessionToDraft` always calls `hydrateCamundaExtensionsFromBpmn({ allowSeedFromBpmn: true })` so XML-only/V2-overlay properties are seeded into `bpmn_meta` on session load. `bpmnStageImperativeApi.js` exposes `getRegistry(name)` so `NotesPanel` can read the modeler registry. |
| **Build** | ✅ Passes | `cd /opt/processmap-test/frontend && npm run build` completes with no errors. |
| **Endpoint** | ✅ Alive (stage) | Stage `clearvestnic.ru:5177` deployed and `/version` returns current commit `1201bf32`. `PUT /api/sessions/{id}/bpmn` and session load endpoints exercised by the verification script. |
| **Tests** | ✅ Fixed regression, 1 pre-existing failure | `node --test src/**/*.test.mjs` → 229 pass / 1 fail. The failing test (`contextual AI actions remain in session create, analysis, timeline and reports`) is pre-existing and fails on clean `main` before these changes. The previously failing `NotesPanel preserves local camunda property drafts per session and selected element` now passes after adjusting the draft-loading code to keep the expected source-code guard patterns. |
| **Serving mode** | ✅ Deployed to stage | `BUILD_ENV=stage ./deploy/deploy.sh` completed successfully; healthcheck passed. |

## Runtime verification

Script: `scripts/e2e/verify_bpmn_v2_properties_sidebar.mjs`

Steps performed on `clearvestnic.ru:5177`:

1. Log in, create a test session.
2. `PUT /api/sessions/{id}/bpmn` with a BPMN XML containing `<camunda:property name="fromXmlProp" value="xml-value-42" />` on a task.
3. Open the session, select the task, expand sidebar «Операция» → «Дополнительные BPMN-свойства».
4. Assert the property row `fromXmlProp = xml-value-42` is visible.
5. Full page reload, re-select the task, re-expand the same sections.
6. Assert the property is still visible.

Result: **SUCCESS** — property visible before and after reload.

## Product code changes

- `frontend/src/App.jsx` — `sessionToDraft` always hydrates XML Camunda extensions into `bpmn_meta`.
- `frontend/src/components/NotesPanel.jsx` — merges live modeler extension state with meta state, preserves draft-cache semantics.
- `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js` — adds `getRegistry(name)`.
