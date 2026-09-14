# EVIDENCE-DATA — измерения аудита dup-logic-audit-v1

Baseline: `origin/main` @ `add38c240fbc48afc8bb1b92d40535ad3699c101`.
Детекторы: jscpd (≥50 tokens / ≥5 lines), AST-фингерпринты (normalized AST → sha1),
same-name кластеры, модульный граф импортов (networkx).

## 1. jscpd — топ пар файлов (backend)

| Клон-строки | Клонов | Файл A | Файл B |
|---|---|---|---|
| 533 | 37 | app/domains/storage/compat/repository.py | (self) |
| 448 | 13 | app/routers/process_properties_registry.py | app/routers/product_actions_registry.py |
| 320 | 11 | app/ai/gateway.py | services/agent/gateway/gateway.py |
| 279 | 21 | app/domains/storage/org_auth/repository.py | (self) |
| 214 | 20 | app/routers/analytics.py | (self) |
| 206 | 1 | app/shared/dto/error_event_helpers.py | services/notifications/app/shared/dto/error_event_helpers.py |
| 191 | 11 | app/agent/memory_store.py | services/agent/memory/memory_store.py |
| 190 | 14 | services/agent/memory/chat.py | (self) |
| 174 | 15 | app/orgs.py | app/services/org_service.py |
| 165 | 14 | app/domains/storage/notes/repository.py | (self) |
| 147 | 1 | app/shared/dto/error_event_dto.py | services/notifications/app/shared/dto/error_event_dto.py |
| 139 | 5 | app/error_events/schema.py | app/shared/dto/error_event_helpers.py |
| 135 | 11 | app/_legacy_main.py | (self) |
| 131 | 4 | app/ai/llm_http_client.py | services/agent/gateway/llm_http_client.py |
| 128 | 10 | app/agent/chat.py | services/agent/memory/chat.py |
| 110 | 5 | app/ai/llm_store.py | services/agent/gateway/llm_store.py |
| 101 | 3 | app/repositories/error_event_repo.py | services/notifications/app/repositories/error_event_repo.py |
| 93 | 10 | app/routers/explorer.py | (self) |
| 87 | 7 | app/domains/storage/audit_telemetry/repository.py | (self) |
| 84 | 11 | app/ai/deepseek_questions.py | (self) |

Итого backend: 535 клонов, 7 095 строк (7.56%) в 290 файлах.

## 2. jscpd — топ пар файлов (frontend)

| Клон-строки | Клонов | Файл A | Файл B |
|---|---|---|---|
| 233 | 1 | features/technologist/workspace/Workspace.jsx:991–1223 | self:1248–1480 |
| 197 | 16 | features/explorer/WorkspaceExplorer.jsx | (self) |
| 144 | 13 | components/ProcessStage.jsx | (self) |
| 139 | 10 | components/sidebar/ElementSettingsControls.jsx | components/sidebar/SelectedNodeSection.jsx |
| 122 | 13 | components/process/BpmnStage.jsx | (self) |
| 118 | 10 | App.jsx | (self) |
| 118 | 9 | features/analytics/AnalyticsPage.jsx | (self) |
| 78 | 5 | features/analytics/AnalyticsPage.jsx | features/analytics/AnalyticsPropertiesPanel.jsx |
| 75 | 7 | features/technologist/graph/GraphCanvas.jsx | features/technologist/graph/OverlayGraphCanvas.jsx |
| 62 | 4 | components/process/interview/TimelineTable.jsx | (self) |
| 53 | 3 | OrgSettingsModal.jsx | AdminOrgInvitesPanel.jsx |
| 52 | 5 | Constructor.jsx | Workspace.jsx |
| 50 | 4 | AiStatusDock.jsx | AiToolsModal.jsx |
| 48 | 3 | RootApp.jsx | (self) |
| 40 | 4 | ProjectWizardForm.jsx | (self) |

Итого frontend: 222 клона, 2 506 строк (2.41%) в 402 файлах.

## 3. Same-name кластеры — backend (топ)

| Имя | Файлов | Вариантов реализации | Примеры файлов |
|---|---|---|---|
| `__init__` | 22 | — | redis_store, serializer, service, repository… |
| `_now_ts` | 13 | 5 | analytics_read_model, repository, schema, publish_git_mirror… |
| `_as_dict` | 12 | 4 | product_actions_suggest, reader, auto_pass_engine, bpmn… |
| `_text` | 9 | 3 | product_actions_suggest, bpmn, process_properties_registry… |
| `_as_text` | 7 | **1 (байт-копии)** | execution_log, prompt_registry, auto_pass_engine, admin… |
| `_as_list` | 7 | 2 | product_actions_suggest, auto_pass_engine, admin, rag… |
| `_json_field` | 7 | 2 | repository (×3), version_repository, param_defs… |
| `_finish` | 6 | — | gateway, ai_questions, notes_extraction, product_actions_ai… |
| `_as_int` | 6 | — | auto_pass_telemetry, admin, auto_pass, product_actions_ai… |
| `_json_loads` | 6 | 4 | analytics_read_model, repository, rag, state, memory_store… |
| `_local_name` | 6 | 5 | deepseek_questions, process_projection, camunda_meta_utils… |
| `_row_to_dict` | 6 | 6 | reader, repository (×2), version_repository, storage_rag… |
| `_new_id` | 6 | 2 | memory_store, llm_store, store, state… |
| `_now_iso` | 5 | 2 | admin_graphs, processor, auto_pass_jobs, admin… |
| `list_project_sessions` | 5 | 5 | projects, session_repo, sessions, sessions_new, session_service |
| `patch_node` / `add_node` / `delete_node` / `add_edge` | 5 | 5 | sessions, sessions_new, session_service, sessions_graph (+1) |

Всего backend same-name кластеров (≥2 файла): 361.

## 4. Same-name кластеры — frontend (топ)

| Имя | Файлов | Вариантов | Комментарий |
|---|---|---|---|
| `toText` | **222** | **5** | дрейф семантики: trim / trim+lower / `?? ""` / без trim / type-switch |
| `asObject` | 150 | 3 | |
| `asArray` | 130 | 5 | |
| `asText` | 46 | 7 | |
| `onKeyDown` | 25 | — | keyboard-обработчики копируются между компонентами |
| `normalizeTier` | 19 | 2 | |
| `fnv1aHex` | 15 | 2 | 14 байт-идентичных копий хэш-функции + 1 дрейф (bpmnSnapshots.js) |
| `fetcher` | 15 | — | admin-панели |
| `toNumber` | 15 | 3 | |
| `asNumber` | 11 | — | |
| `normalizeLoose` | 10 | 2 | |
| `toInt` | 10 | 7 | |
| `walk` | 10 | 16 | разные обходчики деревьев — не дубли |
| `copyText` | 9 | 4 | clipboard-копирование |

Всего frontend same-name кластеров (≥2 файла): 565.

## 5. AST-фингерпринты — структурные клоны функций

- Backend: 77 групп / 174 функции (нормализованный AST идентичен, ≥4 строк).
- Frontend: 563 группы / 1 472 функции.

## 6. Граф (локальная пересборка, метод graphify-semantic-zones)

- Узлы: 1 389 модулей (frontend 1 046, backend 340, persistence 3); рёбра: 3 055.
- Межслойные рёбра: backend→persistence 52; frontend↔backend: 0.
- Компоненты связности: главная frontend (967), backend (262),
  отдельные острова 16/6/6 — `services/agent`, `services/notifications` и пр.
  (сервисы не шарят код импортами — только копипастой).
- Communities: frontend 20, backend 9.

Топ hubs (degree):

| Узел | Degree (in) | Слой |
|---|---|---|
| frontend/src/components/ProcessStage.jsx | 135 (2) | frontend |
| backend/app/storage.py | 106 (82) | backend |
| backend/app/_legacy_main.py | 82 (13) | backend |
| frontend/src/lib/api.js | 73 (68) | frontend |
| frontend/src/App.jsx | 68 (1) | frontend |
| frontend/src/features/admin/components/common/SectionCard.jsx | 65 (64) | frontend |
| frontend/src/features/admin/utils/adminFormat.js | 63 (62) | frontend |
| frontend/src/components/process/BpmnStage.jsx | 62 (1) | frontend |
| backend/app/models.py | 46 (46) | persistence |

## 7. Проверенные примеры (воспроизводимо)

- `fnv1aHex`: байт-идентичные копии в 14 файлах (`App.jsx`, `aiExecutor.js`,
  `bpmnXmlHash.js`, `computeDodSnapshot.js`, `useBpmnSync.js`,
  `useInterviewSyncLifecycle.js`, `useProcessTabs.js`,
  `processLeaveFlushController.js`, …); отдельный дрейф-вариант в `bpmnSnapshots.js`.
- `_as_text`: байт-идентичные копии в 7 backend-файлах
  (`auto_pass_telemetry.py`, `auto_pass_engine.py`, `ai/execution_log.py`, …)
  при существующем `app/shared/coerce.py`.
- `sessions_new.py`: 40/40 имён ⊆ `sessions.py`; монтируется только
  `sessions_router` (`routers/__init__.py:29,62`); внешних ссылок на файл нет.
- `agent_chat.py:9-10`: live-импорт `..agent.chat.run_turn`, `..agent.memory_store`
  (монолит), при `LLM_VIA_AGENT_SVC=0` по умолчанию (docker-compose.yml).
- HEAD main `add38c24` (#976): commit message фиксирует twin-drift
  («services/agent twin обновлён, монолитный отстал»).
