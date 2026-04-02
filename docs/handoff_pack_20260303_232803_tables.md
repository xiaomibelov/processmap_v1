# Handoff Tables (20260303_232803)

## 1) RobotMeta (schema, UI, BPMN sync/import)
| Area | File | Key functions / anchors |
|---|---|---|
| Schema + normalize + status | `frontend/src/features/process/robotmeta/robotMeta.js` | `normalizeRobotMetaV1` (114), `validateRobotMetaV1` (151), `canonicalizeRobotMeta` (223), `getRobotMetaStatus` (275) |
| BPMN import/export (`pm:RobotMeta`) | `frontend/src/features/process/robotmeta/robotMeta.js` | `extractRobotMetaFromBpmn` (397), `syncRobotMetaToBpmn` (501) |
| Stage integration | `frontend/src/components/process/BpmnStage.jsx` | imports `extractRobotMetaFromBpmn/syncRobotMetaToBpmn` (23-28), usage around 1925/1944 |
| Sidebar edit controls | `frontend/src/components/sidebar/ElementSettingsControls.jsx` | uses `canonicalizeRobotMeta/getRobotMetaStatus` |
| Runtime overlays/list | `frontend/src/components/ProcessStage.jsx` | `robot_meta_by_element_id` read/derive around 1420+, status/list around 1555+ |
| Backend storage merge | `backend/app/main.py` | robot meta normalize/update paths around 1705+, 4258+, 4414+, 4571+ |

## 2) Reports (AI build/normalize/list/delete)
| Area | File | Key functions / anchors |
|---|---|---|
| DeepSeek normalization | `backend/app/ai/deepseek_questions.py` | `normalize_deepseek_report_payload` (572), `normalizeDeepSeekReport` (692), `generate_path_report` (1333) |
| Build async + persist | `backend/app/main.py` | `_run_path_report_generation_async` (~1166), `_report_version_detail_payload` (~3323), create/list/delete handlers (~3562-3685) |
| Enterprise reports endpoints | `backend/app/main.py` | `/api/orgs/{org_id}/sessions/{session_id}/reports/*` (5813-5955) |
| Frontend API (enterprise + legacy fallback) | `frontend/src/lib/api.js` | `apiBuildOrgReport` (991), `apiListOrgReportVersions` (1017), `apiGetOrgReportVersion` (1024), `apiDeleteOrgReportVersion` (1038), legacy fallback in 1087+ / 1169+ / 1212+ / 1282+ |

## 3) Playback / Manual Gateways
| Area | File | Key functions / anchors |
|---|---|---|
| Engine core | `frontend/src/features/process/playback/playbackEngine.js` | `classifyGateway` (171), manual wait enqueue (760-771), decision apply `chooseGatewayFlow` (914-942) |
| Overlay popover + click guard | `frontend/src/features/process/bpmn/stage/playbackAdapter.js` | gateway popover render/log (158-170), option click guard + callback (190-205), event rendering `wait_for_gateway_decision` (555+) |
| Existing e2e | `frontend/e2e/diagram-playback-route.spec.mjs` | route-end playback smoke (no explicit manual-gateway assertions) |

## 4) Enterprise org/project scope
| Area | File | Key functions / anchors |
|---|---|---|
| Schema + bootstrap | `backend/app/storage.py` | `org_memberships/project_memberships` create (271-295), `_ensure_enterprise_bootstrap` (509), `resolve_active_org_id` (1212), `get_effective_project_scope` (1952+) |
| Middleware/guard | `backend/app/main.py` | org scope middleware (1833-1871), `_enterprise_error` (161), `_enterprise_require_org_member/role/project_access` (4902+) |
| Enterprise APIs | `backend/app/main.py` | org/projects/members/invites/audit/reports endpoints (5250-5955) |
| Frontend org/report APIs | `frontend/src/lib/api.js` | `/api/orgs/*` wrappers (502+, 515+, 536+, 616+, 755+, 991+) |
| Auth state + org switch | `frontend/src/features/auth/AuthProvider.jsx`, `frontend/src/RootApp.jsx` | active org resolve/select and post-login org-select screen |

## 5) HybridLayer (exists in working tree)
| Area | File | Key functions / anchors |
|---|---|---|
| UI prefs and map normalization | `frontend/src/features/process/hybrid/hybridLayerUi.js` | `HYBRID_UI_STORAGE_KEY` (14), `normalizeHybridUiPrefs` (21), load/save prefs (36/54), map normalize (101) |
| Layers UX + overlay | `frontend/src/components/ProcessStage.jsx` | Layers popover (6172-6280), hybrid overlay render (6562-6640), persist to session meta (4467-4510), `H` peek + `Esc` (3574-3596) |
| CSS | `frontend/src/styles/tailwind.css` | `.hybridLayerOverlay/.isEdit/.hybridLayerShield/...` (~434+) |
| E2E (env-gated) | `frontend/e2e/hybrid-layer-layers.spec.mjs` | `E2E_HYBRID_LAYER=1`, checks View/Edit/peek/playback safety |

