# Инвентаризация трека ДЕКОМПОЗИЦИЯ (рамка v2, шаг 0)

Дата: 2026-08-04. Источник: `origin/main` @ 5d3f37f7 + PR-0 (801fdfd9).
Статус: рамка v2 **апрувлена владельцем** 2026-08-04. Решения:
- R2: scope — **только backend** (frontend/UXF-файлы не трогаем);
- R3: критерий финиша — **`_legacy_main` < 1000 строк + 0 дублей >50 строк по jscpd**;
- R4: порядок — **сначала живые дубли backend, затем нарезка `_legacy_main`**.
Артефакт-компаньон: `routes_baseline.txt` (322 роута, снят с create_app() на origin/main).

## 1. Топ backend-файлов по размеру

| строк | файл | связность (предварительно) | риск |
|---|---|---|---|
| 13286 | `backend/app/storage.py` | `get_storage()` импортируется повсеместно (роутеры, сервисы, `_legacy_main`); PG-пул, redis, file-backend | высокий — корневой модуль, нарезать после `_legacy_main` |
| 10530 | `backend/app/_legacy_main.py` | карта доменов готова (DECOMPOSITION_MAP); 307 def, 122 маршрута, фасад для ~30 тестов | высокий, но изучен; нарезка по MIGRATION_PLAN |
| 2489 | `backend/app/routers/admin.py` | роутер, стандартная структура | средний |
| 2166 | `backend/app/ai/deepseek_questions.py` | LLM-интеграция | средний |
| 1487 | `backend/app/routers/analytics.py` | роутер | средний |
| 1420 | `backend/app/services/session_service.py` | растёт параллельно с `_legacy_main` (переносы), есть дублирующие пути | средний |
| 1226–1048 | `routers/product_actions_ai.py`, `routers/explorer.py`, `routers/process_properties_registry.py` | роутеры | средний |
| 964 | `backend/app/clipboard/materializer.py` | clipboard-подсистема | низкий |

ВНИМАНИЕ: `storage.py` (13 286) больше `_legacy_main.py`. Он корневой (от него зависят все),
поэтому в очереди — ПОСЛЕ `_legacy_main` (порядок «от листьев к корню»), но инвентаризацию его
внутренних доменов (pool, pg-backend, file-backend, redis-cache) стоит начать параллельно.

## 2. Топ frontend-файлов (в scope только после решения R2)

| строк | файл | примечание |
|---|---|---|
| 8097 | `components/ProcessStage.jsx` | ⚠️ пересекается с UXF-треком — отложить/координировать |
| 5932 | `components/process/BpmnStage.jsx` | то же поле UXF |
| 4390 | `App.jsx` | |
| 3959 | `components/NotesPanel.jsx` | |
| 3373 | `features/explorer/WorkspaceExplorer.jsx` | |
| 2835 | `components/NotesMvpPanel.jsx` | ⚠️ возможный живой дубль NotesPanel |
| 2696 | `components/process/interview/utils.js` | |
| 2118 | `lib/api.js` | транспортный слой |

## 3. Дубли: статус

- **PR-0 (закрыт)**: 18 мёртвых теневых дефиниций-дублей в `_legacy_main.py`. ТОЛЬКО dead defs.
- **Живые дубли логики (R1)**: до этой инвентаризации НИГДЕ не учтены. Кандидаты известные качественно:
  - хендлеры сессий: параллельные реализации в `_legacy_main` (хвостовой DEPRECATED-блок, но активные дефиниции) и `services/session_service.py` — риск расхождения (пример: `_require_org_active_for_writes` есть в service, нет в legacy-копии);
  - NotesPanel vs NotesMvpPanel (frontend);
  - сериализация session/dump — несколько `*_api_dump` путей.
- jscpd-скан (min-lines 15 / min-tokens 60): см. раздел 5 (заполняется по результатам прогона).

## 4. Очередь файлов (предложение)

1. Живые дубли backend (серия мелких PR, дёшево) — по итогам jscpd.
2. `_legacy_main.py` — по MIGRATION_PLAN (PR-1 core-shared → app/shared/, далее по доменам).
3. `storage.py` — отдельная карта доменов, нарезка после `_legacy_main`.
4. Frontend — только после R2, ProcessStage/BpmnStage — с координацией UXF.

## 5. jscpd-результаты

Прогон: `jscpd backend/app --min-lines 15 --min-tokens 60` → **83 клона, 2037 строк (3.13%)**.
Кластеры по убыванию (кандидаты на серию мелких PR шага 1):

| кластер | объём | суть |
|---|---|---|
| `routers/process_properties_registry.py` ↔ `routers/product_actions_registry.py` | ~500+ строк (клоны 108/64/47/46/43×3/31/29/20L) | два роутера — почти полные копипасты друг друга; крупнейший живой дубль в репо |
| `error_events/schema.py` ↔ `shared/dto/error_event_helpers.py` + `error_event_dto.py` | ~170 строк (73/54/23/22L) | схема перенесена в shared/dto, оригинал не удалён (или наоборот) |
| `storage.py` — внутренние дубли | ~300 строк (55/45/42×2/33/25/21×3/20L) | параллельные реализации pg/file backend; резать вместе с нарезкой storage.py |
| `_legacy_main.py` ↔ `utils/session_helpers.py` | ~120 строк (42/29/28/23L) | хелперы вынесены в utils, копии в legacy остались |
| `_legacy_main.py` ↔ `services/session_service.py` / `org_service.py` | ~86 строк (32/30/24L) | параллельные реализации хендлеров (риск расхождения, пример с `_require_org_active_for_writes`) |
| `_legacy_main.py` — внутренние | ~120 строк (29/24/23/23/22/21L) | повторы внутри файла, уйдут при нарезке доменов |
| `routers/templates.py`, `exporters/mermaid.py` ↔ `validators/loss.py` | ~60 строк | мелкие внутренние повторы |

Порядок шага 1 (дёшево → дорого): session_helpers-пары (уже есть каноническая реализация — просто удалить копии из legacy и импортировать) → registry-роутеры (общий модуль-ядро + два тонких роутера) → error_events DTO → внутренние дубли storage.py (вместе с его нарезкой).

## 6. Ход выполнения

| PR | домен | что вышло из `_legacy_main.py` | строки `_legacy_main.py` после | PR-ссылка |
|---|---|---|---|---|
| PR-0 | dead defs / дубли | 18 мёртвых теневых дефиниций-дублей | 11 142 → 10 530 | #647 |
| PR-1 | CAS-хелперы | `_require_diagram_cas_or_409`, `_resolve_base_diagram_state_version`, `_mark_diagram_truth_write` → `app/utils/session_helpers.py` | 10 530 → 10 432 | #651 |
| PR-2 | registry-роутеры | product-actions / process-properties registry → `app/routers/_registry_common.py` + тонкие роутеры | 10 432 → 9 301 | #652 |
| PR-3 | error_events | error-events handlers/schema → `app/error_events/` | 9 301 → 9 043 | #653 |
| PR-4 | legacy-tail | мёртвый tail-блок + мёртвые `patch_node` | 9 043 → 8 686 | #654 |
| PR-5 | core-shared | 52 pure-хелпера → `app/shared/` (5 модулей) | 8 686 → 7 890 | #655 |
| PR-6 | auth | auth → `app/auth.py` + `services/auth_service.py` + `services/audit.py` | 7 890 → 7 376 | #656 |
| PR-7 | orgs | orgs → `app/orgs.py` | 7 376 → 6 816 | #658 |
| PR-8 | projects | projects → `app/projects.py` | 6 816 → 6 253 | #659 |
| PR-9 | sessions-core | 18 def CRUD/presence/diagram → `app/sessions_core.py` | 7 890 → 7 376 | #662 |
| PR-pre | session_recompute | `_recompute_session` + `_merge_question_states` → `app/services/session_recompute.py`; дедуп `_resolve_actor_context` | 7 376 → 7 303 | #663 |
| PR-10A | notes-extraction | 14 символов (3 handler) → `app/notes_extraction.py` | 7 303 → 6 786 | #664 |
| PR-10B | ai-questions/interview | 12 символов (handler `ai_questions` + helpers) → `app/ai_questions.py` | 6 786 → 6 207 | #665 |
| PR-10C | answer/disposition | 4 символа (answer/answer_v2 + helpers) → `app/session_answers.py` | 6 207 → 6 022 | #666 |
| PR-11 | sessions-graph | 6 graph-операций (nodes/edges/graph) → `app/sessions_graph.py` | `session_service.py` -230 строк; `_legacy_main.py` +8 | #667 |

**Итог к концу сессии 2026-08-04:** `_legacy_main.py` сокращён с **11 142** до **6 022** строк (-45,9%); добавлены модули `sessions_core`, `session_recompute`, `notes_extraction`, `ai_questions`, `session_answers`, `sessions_graph`. Все PR прошли gate.

## 7. Базлайны для gate-протокола

- pytest baseline: 127 failed / 773 passed / 58 errors (env-уровень, лист зафиксирован: `/opt/processmap/tmp/pr0_baseline.txt` на сервере).
- routes baseline: 322 роута, `routes_baseline.txt`; проверено на PR-0 — diff пустой (байт-в-байт).
- ⚠️ Образ `app-api` пересобран 2026-08-04 12:26 UTC; новый Starlette добавляет `HEAD` к 4 docs-рутам (`/api/docs`, `/api/openapi.json`, `/api/redoc`, `/docs/oauth2-redirect`). Для сравнения route-surface в новых PR используется same-image эталон (`routes_prpre_base.txt` на сервере), поэтому дельта остаётся пустой.
