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

## 6. Базлайны для gate-протокола

- pytest baseline: 127 failed / 773 passed / 58 errors (env-уровень, лист зафиксирован: `/opt/processmap/tmp/pr0_baseline.txt` на сервере).
- routes baseline: 322 роута, `routes_baseline.txt`; проверено на PR-0 — diff пустой (байт-в-байт).
