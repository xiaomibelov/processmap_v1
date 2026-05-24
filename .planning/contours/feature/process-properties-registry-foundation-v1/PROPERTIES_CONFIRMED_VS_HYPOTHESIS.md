# PROPERTIES_CONFIRMED_VS_HYPOTHESIS

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

| Candidate source | Classification | Evidence | Allowed in this contour | Reason |
| --- | --- | --- | --- | --- |
| `bpmn_meta.camunda_extensions_by_element_id.*.properties.extensionProperties[]` | `confirmed current source` | `normalizeBpmnMeta()`, `normalizeCamundaExtensionsMap()` | Yes, session/diagram scope only | Stable frontend model exists; row mapping is direct name/value/source. |
| `bpmn_meta.camunda_extensions_by_element_id.*.properties.extensionListeners[]` | `confirmed current source` | `normalizeCamundaExtensionState()` | Yes, if labeled as listener properties | Needs explicit synthetic property label. |
| BPMN businessObject `camunda:`/`zeebe:` scalar fields | `confirmed current source` | `extractCamundaZeebePropertyEntriesFromBusinessObject()` | Yes, loaded diagram runtime only | In-memory source requires current diagram runtime. |
| BPMN extension elements from businessObject | `confirmed current source` | recursive extraction in `extractCamundaZeebePropertyEntriesFromBusinessObject()` | Yes, loaded diagram runtime only | Emits `sourcePath`; not workspace/project aggregate by itself. |
| `/api/sessions/{id}/bpmn_meta` | `available but requires safety proof` | `apiGetBpmnMeta()`, backend `session_bpmn_meta_get()` | Session only, if no unsafe runtime effect is proven | Backend GET normalizes and can save normalized meta. |
| `bpmn_meta.robot_meta_by_element_id` | `available but not suitable for generic properties` | `normalizeRobotMetaMap()`, `useDiagramElementMetaModel()` | Only as explicit `Robot Meta` source group | Different domain model; not Camunda/Zeebe properties. |
| Property overlay preview | `available but not suitable for registry truth` | `buildPropertiesOverlayPreview()` | No as canonical data; yes as UI inspiration | Presentation-limited preview, not durable registry source. |
| Properties overlay modal/schema | `available but not suitable for registry truth` | `buildBpmnPropertiesOverlaySchema()` | No as canonical data | Editable UI state, not aggregation source. |
| Organization property dictionary | `requires backend/API work later` | `/api/orgs/{org_id}/property-dictionary/...` routes | No for current registry rows | Dictionary is definitions/allowed values, not extracted process rows. |
| `bpmn_meta.flow_meta` / `node_path_meta` | `available but not suitable for this contour` | `normalizeBpmnMeta()`, DoD readiness model | No as generic properties | Path/tier metadata, not properties registry rows unless later product decision maps them. |
| DoD/readiness quality checks | `hypothesis/future` | `buildDodReadinessV1.js` | No | Analysis output; not extracted property data. |
| `nodes_json` / `edges_json` / `bpmn_meta_json` workspace rows | `requires backend/API work later` | backend workspace artifact code reads DB JSON fields | No for this contour unless implementation proves exposed API | No ready Properties Registry aggregation endpoint found. |
| Product Actions registry data | `available but not suitable for this contour` | `POST /api/analysis/product-actions/registry/query` | No | Different durable truth: `interview.analysis.product_actions[]`. |
| RAG indexed chunks | `hypothesis/future` | RAG preflight says read-only context layer | No | RAG is not source of truth and cannot create rows/counts. |

## Minimum real-data source set

Real-data mode may be accepted only if rows come from:

1. current session `bpmn_meta.camunda_extensions_by_element_id`; or
2. current loaded diagram businessObject extraction; or
3. another source with the same level of exact file/path/runtime proof.

Workspace/project mode should stay foundation/empty unless a safe aggregation route is implemented in a later contour.
