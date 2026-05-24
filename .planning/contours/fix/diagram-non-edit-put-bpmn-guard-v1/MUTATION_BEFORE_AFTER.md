# MUTATION_BEFORE_AFTER — fix/diagram-non-edit-put-bpmn-guard-v1

## Network Mutation Evidence

### Before Fix (Source-Level Analysis)
| Scenario | Expected | Actual (source proof) | Root Path |
|---|---|---|---|
| Diagram idle | 0 PUT/PATCH | Could be 1+ PUT /bpmn | `stageRuntimeChange` → `requestAutosave` → `flushSave` → `doFlush` (hash guard bypassed because `localDirty === true`) |
| Pan/zoom | 0 PUT/PATCH | 0 (verified safe in previous contour) | Overlay/viewbox handlers do not call `emitDiagramMutation` |
| Selection/hover | 0 PUT/PATCH | Could be 1+ PUT /bpmn | `commandStack.changed` (empty command) → `onRuntimeChange` → `emitDiagramMutation` → `queueDiagramMutation` → autosave |
| Tab switch | 0 PUT/PATCH | Could be 1+ PUT /bpmn | `flushFromActiveTab(force=true)` → `saveFromModeler` → `saveLocal` → `flushSave` with `localDirty === true` |
| Property sidebar open/focus/blur | 0 PUT/PATCH | Could be 1+ PUT /bpmn | Extension sync may trigger `commandStack.changed` |
| Explicit save (Ctrl+S / Save button) | 1 PUT /bpmn with `manual_save` | 1 PUT /bpmn | Intended behavior |

### After Fix (Source-Level Proof)
| Scenario | Expected | Proof |
|---|---|---|
| Diagram idle | 0 PUT/PATCH | `queueDiagramMutation` blocks empty `commandStack.changed`; `stageRuntimeChange` respects suppression; coordinator hash-guard skips unchanged XML for autosave even if dirty |
| Pan/zoom | 0 PUT/PATCH | Unchanged (no mutation paths touched) |
| Selection/hover | 0 PUT/PATCH | Empty `commandStack.changed` blocked at wiring + scheduler + coordinator layers |
| Tab switch | 0 PUT/PATCH | `saveFromModeler` early hash guard skips if XML unchanged; coordinator hash-guard skips for `tab_switch` if unchanged |
| Property sidebar open/focus/blur | 0 PUT/PATCH | Same multi-layer guard as selection/hover |
| Explicit save | 1 PUT /bpmn with `manual_save` | `manual_save` is not `isNonExplicitReason`; hash-guard requires `!localDirty` (unchanged from baseline); early hash guard only applies to `autosave`/`tab_switch` |
| Import/init | 0 PUT/PATCH | `renderModeler`/`renderViewer` wrapped with `suppressEmitDiagramMutationRef` and `withSuppressedCommandStack`; `onRuntimeChange` suppresses init-like sources |

## Request Detail Capture

### Baseline Runtime Observation (before code changes)
- **URL**: `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`
- **Method**: Browser fetch interception via `window.fetch` override
- **Observation window**: 30s idle + pan/zoom + 5 element clicks
- **Mutation requests captured**:
  - `POST /api/sessions/4c515d1c6e/presence` — expected heartbeat, not a durable mutation
  - **0 `PUT /api/sessions/*/bpmn`**
  - **0 `PATCH /api/sessions/*`**
- **Conclusion**: Bug is intermittent; source-level fix applied on confirmed risky paths.

## Payload Safety
- No full BPMN XML printed in logs or reports.
- Hashes computed via `fnv1aHex` only.
