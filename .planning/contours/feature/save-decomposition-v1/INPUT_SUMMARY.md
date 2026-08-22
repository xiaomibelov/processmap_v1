# INPUT_SUMMARY — feature/save-decomposition-v1

**Source audit:** `.planning/contours/audit/save-decomposition/`  
**Base branch:** `new-origin/main` (`35cbc78e`)  
**Contour branch:** `feature/save-decomposition-v1`

---

| Вопрос | Ответ из аудита |
|--------|-----------------|
| **Сколько save-операций?** | **81 mutating-операция** across 8 доменов: Sessions & BPMN (27), Projects/Workspaces/Folders (13), Orgs/Members/Invites (12), Notes (9), Org Dictionary + Templates (7), AI/RAG/Admin (6), Feature Flags/Telemetry/Reports (7). |
| **Топ-3 критичных save-операций?** | 1. **`PUT /api/sessions/{sid}/bpmn`** — единственный путь сохранения диаграммы и Camunda-свойств; CAS по `diagram_state_version`, Redis-lock, snapshot в `bpmn_versions`. <br> 2. **`PATCH /api/sessions/{sid}`** — универсальный патч; при изменении `bpmn_meta`/`nodes`/`edges`/`interview` проверяет CAS. <br> 3. **`PATCH /api/sessions/{sid}/bpmn_meta`** — мета уровней/робота/гибрида/drawio; при prior fix выяснилось, что он не возвращал новую `diagram_state_version`, что приводило к stale CAS. |
| **Где сейчас 409 Conflict?** | При property-only save (`PATCH /meta` / property panel → `PUT /bpmn`) frontend шлёт stale `base_diagram_state_version`, потому что: <br> - meta-only saves не всегда возвращают свежую версию; <br> - property panel сериализует свойства в полный BPMN XML и использует `PUT /bpmn`, который строго проверяет CAS; <br> - при входе в сессию `draft.diagram_state_version` может отставать от сервера. |
| **Какие микросервисы предложены?** | На основе аудита — **15 сервисов**: `auth-service`, `workspace-service`, `session-persistence-service`, `extension-state-service`, `property-sync-service`, `process-definition-service`, `notes-service`, `analytics-aggregator`, `ai-service`, `rag-service`, `notification-service`, `admin-service`, `telemetry-service`, `sync-service`, `diagram-modeler-service`. <br> В рамках этого контура пользователь сфокусировал декомпозицию на 5 модулях внутри монолита: **session_save**, **property_save**, **status_service**, **analytics_aggregator**, **org_dictionary**. |
| **С чего начать миграцию?** | **Phase 0 (pre-requisites):** колонка `session_status`, схема `bpmn_meta_json`, structured logging save-эндпоинтов, Strangler Fig routing. <br> **Phase 1 (quick wins):** вынести `rag-service` и `auth-service` (низкий риск), ввести `SessionFacade`/`ProcessFacade`, добавить `property_save` endpoint, сделать analytics async. <br> **В рамках текущего контура — начать с `property_save`, т.к. он снимает 409.** |

---

## Implications for this contour

1. **Immediate 409 fix** must change the property-save flow so the frontend never sends a stale `base_diagram_state_version`.
2. **Decomposition** should be bounded: create `backend/app/save_services/` with `session_save`, `property_save`, `status_service`, `analytics_aggregator`, `org_dictionary` modules, but keep them inside the monolith first (no external services yet).
3. **No broad refactor** — `_legacy_main.py` remains for unrelated logic; only save-related functions move.
4. **Tests** should cover the 409 reproduction and module boundaries.
