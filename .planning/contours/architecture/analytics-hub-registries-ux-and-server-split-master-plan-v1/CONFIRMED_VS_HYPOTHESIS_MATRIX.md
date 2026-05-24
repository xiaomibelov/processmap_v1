# Confirmed vs Hypothesis Matrix

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`

| Тема | Confirmed truth | Derived runtime truth | Hypothesis / proposed | Evidence |
|---|---|---|---|---|
| Analytics Hub exists | Да, есть `ProcessAnalyticsHub` | Route `surface=analytics` должен открывать page | Hub станет L1 analytics workspace | `ProcessAnalyticsHub.jsx`, `processMapRouteModel.js`, `ProcessStage.jsx` |
| Hub metrics | Значения в UI сейчас `—` | Пользователь не получает реальные counts из Hub cards | Нужно подключить backend aggregate metrics | `ProcessAnalyticsHub.jsx` |
| Hub modules | Registry/properties/dashboards/export cards есть | Registry card открывает Product Actions Registry | Properties/dashboard/export станут отдельными modules | `ProcessAnalyticsHub.jsx` |
| Product Actions Registry page | Да, dedicated page есть | Открывается через `surface=product-actions-registry` | Может стать канонической L2 registry page | `ProductActionsRegistryPage.jsx` |
| Registry modal legacy | Да, overlay export still exists | Может использоваться legacy in-session entry | Нужно постепенно убрать/ограничить overlay path | `ProductActionsRegistryPanel.jsx` |
| Registry scopes | Workspace/project/session tabs есть | Backend query строится по активному scope | Workspace/project должны стать primary aggregation modes | `ProductActionsRegistryPanel.jsx` |
| Durable Product Actions truth | `interview.analysis.product_actions[]` | Registry rows нормализуются из durable actions | Не хранить Product Actions в BPMN XML | `productActionsRegistryModel.js`, `productActionsPersistence.js`, `backend/app/routers/product_actions_registry.py` |
| Registry backend aggregation | Query/export endpoints есть | Backend returns rows, sessions, session_summary | Row shaping может перейти ещё глубже в backend contracts | `backend/app/routers/product_actions_registry.py` |
| Registry empty state | Empty/status copy есть | No fake rows rendered | Empty state может стать richer diagnostic state | `ProductActionsRegistryTable.jsx`, `ProductActionsRegistryPanel.jsx` |
| Registry populated state | Rows/filters/metrics/pagination/export есть | Populated table shows product/action/process/status | Нужно UX proof against actual data after branch isolation | `registry/*.jsx`, `ProductActionsRegistryPanel.jsx` |
| Bulk AI in registry | Endpoint + UI controls есть | Suggestions require explicit accept | AI could become read-only assistant layer with stronger provenance | `product_actions_ai.py`, `ProductActionsRegistryPanel.jsx` |
| RAG product actions | Product-actions index endpoint exists | Indexing selected/all durable actions is possible | RAG remains suggestion/reference layer only | `backend/app/routers/rag.py`, `frontend/src/lib/api.js`, RAG preflight |
| Properties Registry | Dedicated registry page/API not found | Hub shows `Реестр свойств` as `Скоро` | New contour should define read-only properties registry | `ProcessAnalyticsHub.jsx`, property overlay/dictionary artifacts |
| Property runtime artifacts | Property dictionary, BPMN properties overlay, semantic payload support exist | Existing artifacts are fragmented across admin/storage/BPMN overlay | Registry can aggregate them only after source-truth design | `apiRoutes.js`, `storage.py`, `decorManager.js`, `templateSemanticPayload.js` |
| DB proof | Durable paths are inferable from storage/router code | Live DB contents not queried in part 1 | Reviewer/runtime lane should query durable data for scenario proof | Source-only executor scope |
| Env/compose proof | Not established in this part | No live server checked | Required before final release/runtime verdict | Worker prompt did not require live validation |
| Dirty branch safety | Dirty checkout confirmed | Current tree cannot be treated as one clean merge contour | Need branch hygiene before PR/merge | `git status -sb`, `git diff --stat` |

## Key separation

Confirmed truth is limited to files and contracts observed in this checkout. Derived runtime truth is what the code will do if the served runtime matches this checkout. Hypothesis/proposed items are planning direction and must not be presented as already durable product behavior.
