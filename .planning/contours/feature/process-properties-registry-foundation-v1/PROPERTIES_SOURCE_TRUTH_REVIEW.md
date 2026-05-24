# PROPERTIES_SOURCE_TRUTH_REVIEW

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Verdict

PASS для Part 2: source-truth review выполнен. Real data mode допустим только для источников, у которых доказаны source file, runtime data path, row mapping, metrics, filters и mutation safety.

## Confirmed current source: session/diagram Camunda/Zeebe properties

Evidence:

- `frontend/src/features/process/camunda/camundaExtensions.js`
  - `normalizeCamundaExtensionState()` нормализует `properties.extensionProperties[]` и `properties.extensionListeners[]`.
  - `normalizeCamundaExtensionsMap()` хранит map by element id.
  - `extractCamundaExtensionsMapFromBpmnXml()` читает `camunda:properties`, `zeebe:properties`, `camunda:executionListener` из BPMN XML.
  - `hydrateCamundaExtensionsFromBpmn()` умеет merge extracted/session state.
- `frontend/src/app/bpmnMetaNormalization.js`
  - `normalizeBpmnMeta()` включает `camunda_extensions_by_element_id`.
- `frontend/src/lib/apiRoutes.js`
  - `sessions.bpmnMeta(sessionId)` указывает на `/api/sessions/{session_id}/bpmn_meta`.
- `frontend/src/lib/api.js`
  - `apiGetBpmnMeta(sessionId)` читает этот endpoint.

Allowed row mapping for real-data mode:

| Registry field | Source mapping |
| --- | --- |
| `Объект` | element id/title from BPMN runtime or session node catalog; id is required |
| `Свойство` | `extensionProperties[].name` or listener synthetic label |
| `Значение` | `extensionProperties[].value` or listener `event/type/value` |
| `Источник / процесс` | session/project/workspace context plus source label `bpmn_meta.camunda_extensions_by_element_id` |
| `Тип / группа` | `Camunda/Zeebe extension`, `extensionProperties`, `extensionListeners` |
| `Статус` | `real`, `empty-value`, or `source-incomplete`; no invented completeness |

Limits:

- Confirmed for session/diagram scope.
- Workspace/project aggregation is not confirmed unless implementation proves safe session enumeration and fetch strategy.
- Direct use of `GET /api/sessions/{id}/bpmn_meta` needs runtime proof because backend normalizes and may save when normalized meta differs.

## Confirmed current source: in-memory BPMN businessObject extraction

Evidence:

- `frontend/src/features/process/stage/search/extractCamundaZeebePropertyEntries.js`
  - scans scalar `camunda:`/`zeebe:` keys;
  - recursively scans extension elements in Camunda/Zeebe scope;
  - emits `propertyName`, `propertyValue`, `sourcePath`.
- `frontend/src/features/process/stage/search/useDiagramPropertySearchModel.js`
  - normalizes row-like entries with `elementId`, `elementTitle`, `elementType`, `propertyName`, `propertyValue`, `sourcePath`.

Allowed use:

- Search/list rows for the currently loaded diagram runtime.
- Session-scope registry if the page is backed by the loaded modeler/viewer data.

Not allowed without more proof:

- Workspace/project counts.
- Durable DB claims.
- Showing rows after a cold route where the BPMN runtime is not loaded.

## Available but not suitable: overlays and property dictionary UI

Evidence:

- `frontend/src/features/process/camunda/propertyDictionaryModel.js`
  - derives overlay preview rows and `totalCount` from extension state.
- `frontend/src/features/process/bpmn/context-menu/properties-overlay/buildBpmnPropertiesOverlaySchema.js`
  - creates editable overlay sections for name/documentation/extension rows and read-only Robot Meta rows.
- Obsidian `PROJECT ATLAS/13_Шаблоны свойства и оверлеи.md`
  - overlays are UI/metadata layer and must not mutate durable BPMN truth outside write boundary.

Classification: available but not suitable as registry truth for this contour.

Reason:

- Overlay preview is a presentation surface.
- It may hide rows via visible limits.
- It may include editable UI state and dictionary-derived labels that are not canonical registry data.

## Available but not suitable: Robot Meta

Evidence:

- `bpmn_meta.robot_meta_by_element_id` is normalized in frontend and backend.
- `useDiagramElementMetaModel()` computes Robot Meta status/counts.
- `buildBpmnPropertiesOverlaySchema()` can show Robot Meta rows as read-only overlay details.

Classification: available but not suitable as generic property source in this contour.

Allowed:

- Display as its own source group only if implementation labels it explicitly as `Robot Meta` and maps fields exactly.

Not allowed:

- Mixing Robot Meta fields into generic BPMN properties without source label.
- Counting Robot Meta as Camunda/Zeebe extension properties.

## Hypothesis/future: DoD, quality, role/lane/equipment, process metadata

Evidence:

- `frontend/src/features/process/dod/buildDodReadinessV1.js` reads `bpmn_meta.flow_meta`, `bpmn_meta.node_path_meta`, `auto_pass_v1` and readiness artifacts.
- Backend workspace artifact code reads `bpmn_meta_json`, interview, notes and robot meta counts.

Classification:

- DoD/quality/readiness: available analysis model, not suitable as Properties Registry rows in this contour.
- Role/lane/equipment/product-related process metadata: hypothesis/future unless exact current field path is proven.
- Product Actions data: not suitable; canonical source is `interview.analysis.product_actions[]`, not properties registry truth.

## Mutation safety requirements

Real-data mode must prove:

- no BPMN XML write from viewing/opening/filtering;
- no Product Actions durable truth write;
- no backend/schema migration;
- no `PUT/PATCH/DELETE` during view/navigation;
- if `GET /bpmn_meta` is used, DB effect is understood and accepted or avoided.

If any requirement is not proven, render foundation mode.
