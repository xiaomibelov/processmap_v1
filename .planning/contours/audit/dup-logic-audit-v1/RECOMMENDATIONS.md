# RECOMMENDATIONS — реестр follow-up контуров

По результатам audit/dup-logic-audit-v1. Каждый пункт — отдельный bounded контур
(fix или refactor), ветка от `origin/main`, отдельный PR. Порядок = приоритет.

## R1 (P0, refactor) — Единый источник истины для LLM/agent-домена
Проблема: форк `app/ai/*`+`app/agent/*` ↔ `services/agent/*`, дрейф подтверждён
(chat.py 287↔1629 строк; инцидент twin-drift в #976).
Предложение: выбрать canonical-копию (по факту live-пути — монолит), вынести
общее в импортируемый shared-пакет (`backend/shared_llm/` или отдельный
workspace-пакет), сервис переключить на импорт вместо копии.
Gate: сначала runtime-подтверждение `LLM_VIA_AGENT_SVC` на stage/prod.
Без этого контура любые фиксы LLM-цепочки требуют двойной работы.

## R2 (P1, fix) — Удаление мёртвого `routers/sessions_new.py`
202 строки, 40 handlers, 100%-дубль контракта sessions.py, нигде не смонтирован.
Безопасное удаление одним файлом + прогон backend-тестов. Быстрый выигрыш.

## R3 (P1, refactor) — Frontend shared text-coerce utils
Создать `frontend/src/shared/coerce.js` (toText/asText/asObject/asArray/toNumber/toInt/
normalizeLoose/normalizeTier/fnv1aHex/copyText) с **одной** семантикой на функцию;
мигрировать ~500+ локальных копий волнами по доменам (admin → session → bpmn → …).
Внимание: 5 вариантов `toText` имеют разную семантику — перед миграцией зафиксировать
каноническую (предложение: `String(v ?? "").trim()`), места, завязанные на
lower-case/без-trim поведение, перевести на явные отдельные хелперы.
Метрика приёмки: 0 локальных определений toText/asObject/asArray вне shared.

## R4 (P1, refactor) — Backend: консолидация приватных coerce-копий в app/shared
`_as_text/_now_ts/_as_dict/_as_list/_json_loads/_json_field/_new_id/_now_iso`
(60+ определений в 40+ файлах) → re-export из `app/shared/coerce.py` / `text_utils.py`.
Копии байт-идентичны — миграция механическая; `_row_to_dict` (6 разных) и `_local_name`
(5 разных) требуют ручной сверки семантики.

## R5 (P2, refactor) — Слияние registry-роутеров
`process_properties_registry.py` + `product_actions_registry.py`: 448 общих
клон-строк → общий registry-core (scopes, экспорт, guards) + тонкие адаптеры.

## R6 (P2, refactor) — Базовый Repository для domains/storage
Повторяющийся CRUD-шаблон (2 800+ клон-строк суммарно по compat/org_auth/ai/notes) →
базовый класс/миксин с параметризацией сущности; `_row_to_dict`/`_json_field` — в базу.

## R7 (P2, refactor) — Декомпозиция frontend self-клонов
Workspace.jsx (233-строчный дубль панели), WorkspaceExplorer.jsx, ProcessStage.jsx,
BpmnStage.jsx, App.jsx, AnalyticsPage.jsx — вынос повторов в подкомпоненты/хуки.
Парные клоны: ElementSettingsControls↔SelectedNodeSection (139 строк),
GraphCanvas↔OverlayGraphCanvas (75), AnalyticsPage↔AnalyticsPropertiesPanel (78) —
общий базовый компонент или composition.

## R8 (P3, refactor) — Декомпозиция god-хабов
`storage.py` (in-degree 82), `ProcessStage.jsx` (degree 135), `_legacy_main.py`
(6 131 строка) — разбиение по доменам; снижает притяжение копипасты.

## R9 (P3, tooling) — Закрепить детекцию в CI
jscpd-gate (порог: не растить 7.56% backend / 2.41% frontend) + линтер-правило
«нет локальных определений toText/asObject/asArray» (custom ESLint/no-restricted-syntax)
после завершения R3/R4. Отчёт дублей — артефакт CI.

## Что делать НЕ нужно
- Массовый auto-refactor без runtime-подтверждения P0 (см. FIVE-PLANE-PROOF, plane 5).
- Слияние `walk`-функций и event-хендлеров (`onKeyDown` и пр.) — это не дубли,
  а разные реализации под одинаковым именем.
