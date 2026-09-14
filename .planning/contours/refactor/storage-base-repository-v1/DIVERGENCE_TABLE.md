# Таблица семантических расхождений `_row_to_dict` / `_now_ts`

Контур: `refactor/storage-base-repository-v1`, шаг 5a. Условие approve №1.
Скоуп скана: `backend/app/domains/storage/**/*.py` (состояние ветки на момент шага 5a).
Канонические реализации до шага 5a жили в `compat/repository.py` и импортировались
`base.py`. После шага 5a каноника живёт в `base.py`, `compat` делает re-export.

## Канонические определения (после шага 5a)

| Функция | Локация | Семантика |
|---|---|---|
| `_json_dumps(value, fallback)` | `base.py` | `json.dumps(_to_jsonable(value if value is not None else fallback), ensure_ascii=False)`; `_to_jsonable` рекурсивно нормализует dict/list/tuple/set, вызывает `model_dump()`/`dict()` у pydantic-объектов; при ошибке сериализации — повтор с fallback |
| `_json_loads(value, fallback)` | `base.py` | `str(value or "")`; пусто → fallback; `json.loads`, `None`-результат → fallback; исключение → fallback |
| `_now_ts()` | `base.py` | `int(datetime.now(timezone.utc).timestamp())` — целые секунды Unix-эпохи, UTC, усечение (truncation) |
| `row_to_dict(row, json_cols=None)` | `base.py` | `dict(row)`; при `json_cols` (src→dst): pop src, `_json_loads` с fallback из dst; **`json_cols=None` ≡ `dict(row)`** |

Публичные алиасы в `base.py`: `now_ts()`, `json_dumps()`, `json_loads()` — тонкие
обёртки над приватными канониками.

## Часть A. Row-мапперы

| # | Call-site (файл:строка) | Имя | Исходная семантика | Что даёт каноника из base | Вердикт |
|---|---|---|---|---|---|
| A1 | `base.py:75` | `row_to_dict(row, json_cols=None)` | `dict(row)` + опциональная JSON-десериализация/rename колонок | сам канон | ЭКВИВАЛЕНТ при `json_cols=None` ≡ `dict(row)` (тело цикла не выполняется, доказательство тривиально) |
| A2 | `base.py:144` | `_apply_mapper(mapper=None)` | `dict(row)` при отсутствии маппера | то же | ЭКВИВАЛЕНТ |
| A3 | `compat/repository.py:2935` | `_row_to_dict(row)` | `dict(row)` | `row_to_dict(row)` (json_cols=None) | ЭКВИВАЛЕНТ — поведение совпадает на всех входах, т.к. ветка json_cols отсутствует |
| A4 | `compat/repository.py:397` | `_ai_execution_log_row_to_dict` | Проекция в DTO: `str(... or "")` coercion, вложенный `scope`, `_json_loads(usage_json, {})`, `int(... or 0)` | только `dict(row)` | ОТЛИЧИЕ — доменная проекция с типовой нормализацией и вложенной структурой; не канонизируется в 5a (контур 5b) |
| A5 | `compat/repository.py:428` | `_ai_prompt_version_row_to_dict` | Проекция DTO + `scope={level,id}`, `_json_loads` двух JSON-колонок | `dict(row)` | ОТЛИЧИЕ — доменная проекция |
| A6 | `compat/repository.py:451` | `_audit_row_to_dict` | rename `meta_json`→`meta` с `_json_loads(..., {})`, `int/str` coercion, дефолт `status="ok"` | `dict(row)` | ОТЛИЧИЕ — rename + десериализация JSON-колонки (поведение `row_to_dict(json_cols=...)` покрывает rename, но не coercion/дефолты) |
| A7 | `compat/repository.py:528` | `_conversation_row_to_dict(row, now_ts)` | Проекция + производное поле `status` через `_conversation_status(updated_at, now_ts)` (24ч) | `dict(row)` | ОТЛИЧИЕ — вычисляемое поле от внешнего `now_ts` |
| A8 | `compat/repository.py:2430` | `_error_event_row_to_dict` | Проекция DTO, `int(schema_version or 1)`, `_json_loads(context_json, {})`, `str(...) if not None else ""` | `dict(row)` | ОТЛИЧИЕ — доменная проекция |
| A9 | `compat/repository.py:2518` | `_invite_row_to_dict` | Толерантный маппер: `_col()` с проверкой `row.keys()` (колонки могут отсутствовать), нормализация email/role/permissions, производный `status`, бэкфил `used_at`←`accepted_at` | `dict(row)` | ОТЛИЧИЕ — маппер сознательно толерантен к схеме без колонок; каноника бросила бы KeyError |
| A10 | `compat/repository.py:2809` | `_org_property_dictionary_definition_row_to_dict` | Проекция с дублированием ключей camelCase+snake_case, `_normalize_input_mode`, `bool(int(...))` | `dict(row)` | ОТЛИЧИЕ — API-контракт с двойными ключами + нормализация |
| A11 | `compat/repository.py:2836` | `_org_property_dictionary_operation_row_to_dict` | Аналогично A10 (camelCase+snake) | `dict(row)` | ОТЛИЧИЕ |
| A12 | `compat/repository.py:2856` | `_org_property_dictionary_value_row_to_dict` | Аналогично A10 (camelCase+snake) | `dict(row)` | ОТЛИЧИЕ |
| A13 | `compat/repository.py:2879` | `_project_row_to_model` | Проекция + `_json_loads(passport_json)` + валидация `Project.model_validate` | `dict(row)` | ОТЛИЧИЕ — возвращает pydantic-модель, не dict-проекцию |
| A14 | `compat/repository.py:3138` | `_suggestion_row_to_dict` | Толерантный маппер (`row.keys()`), `_json_loads(... or "{}", {})`, дефолты `pending`/`llm` | `dict(row)` | ОТЛИЧИЕ — толерантность к схеме + JSON-колонки |
| A15 | `org_auth/repository.py:146` | `_auth_user_row_to_dict` | Через `_row_value` (Mapping/Row), `_normalize_email`, `.strip()`, дефолт `role="analyst"`, `bool(int(...))` | `dict(row)` | ОТЛИЧИЕ — нормализация значений |
| A16 | `org_auth/repository.py:375` | `_group_row_to_dict` | Проекция с `str/int` coercion | `dict(row)` | ОТЛИЧИЕ — типовая нормализация |
| A17 | `org_auth/repository.py:576` | `_template_folder_row_to_dict` | Проекция + `_normalize_template_scope` | `dict(row)` | ОТЛИЧИЕ — нормализация enum |
| A18 | `org_auth/repository.py:590` | `_template_row_to_dict` | Проекция + `_json_loads(payload_json)` + `bpmn_element_ids` derive + `_normalize_template_type/folder_id` | `dict(row)` | ОТЛИЧИЕ — производные поля |
| A19 | `org_auth/repository.py:1260` | `_workspace_row_to_dict` | Проекция с `str/int` coercion | `dict(row)` | ОТЛИЧИЕ — типовая нормализация |
| A20 | `canvas_session/repository.py:74` | `_folder_row_to_dict` | Смешанный доступ (`row[...]` + `_row_value`), `responsible_user_id → None` при пустом, дефолт `context_status="none"`, `archived_at` без coercion | `dict(row)` | ОТЛИЧИЕ — None-нормализация и дефолты |
| A21 | `utils/repository.py:185` | `_note_comment_row_to_dict` | Проекция через `_row_value` + производное `is_deleted` | `dict(row)` | ОТЛИЧИЕ — производное поле |
| A22 | `utils/repository.py:203` | `_note_mention_row_to_dict` | Проекция через `_row_value` с coercion | `dict(row)` | ОТЛИЧИЕ — типовая нормализация |
| A23 | `utils/repository.py:227` | `_note_thread_row_to_dict(row, *, attention_acknowledged_at=0)` | Проекция + kwarg-параметр, `_json_loads(scope_ref_json)`, `_normalize_note_priority`, дефолты `unread_count=0` и т.п. | `dict(row)` | ОТЛИЧИЕ — сигнатура с kwarg + производные поля |
| A24 | `utils/repository.py:285` | `_org_git_mirror_payload` | Частичная проекция (update-фрагмент), нормализация provider/health, `_opt_text`, `max(0, updated_at)` | `dict(row)` | ОТЛИЧИЕ — фрагмент-проекция с нормализацией |
| A25 | `platform/repository.py:32` | `_format_deployment_notice_row(d: dict)` | Маппер **от dict** (не от Row): `d.get`, `bool(d.get("is_active", 1))` — семантически отличается от `bool(int(...))` для строк | `dict(row)` | ОТЛИЧИЕ — вход dict, иная coerce-семантика `is_active` |

Итого A: **3 ЭКВИВАЛЕНТ** (A1/A2/A3), **22 ОТЛИЧИЕ** — все отличия это осознанные
доменные проекции DTO (типовая нормализация, rename JSON-колонок, производные
поля, толерантность к схеме), а не дубли `_row_to_dict`. В 5a канонизируется
только тождественный случай `dict(row)`; CRUD-блоки compat — контур 5b.

## Часть B. Варианты `_now_ts`

Аудит фиксировал 5 вариантов генерации «сейчас» в storage-домене. Фактическое
состояние ветки на шаг 5a (полный скан `datetime.now|time.time()|.timestamp()`):

| # | Call-site (файл:строка) | Выражение | Единицы / таймзона / округление | Вердикт |
|---|---|---|---|---|
| B1 | `compat/repository.py:2805` | `int(datetime.now(timezone.utc).timestamp())` | секунды Unix-эпохи, UTC, truncation → int | КАНОН |
| B2 | `platform/repository.py:227` (`set_feature_flag`) | `int(time.time())` | секунды Unix-эпохи, UTC (epoch не зависит от TZ), truncation → int | ЭКВИВАЛЕНТ — `time.time()` возвращает те же epoch-секунды UTC; `int()` одинаково усечёт. Мигрирован на `_now_ts()` в 5a |
| B3 | `compat/repository.py:2268` (seed `lightweightOverlays`) | `int(time.time())` | то же | ЭКВИВАЛЕНТ (доказательство как B2). Мигрирован на `_now_ts()` в 5a |
| B4 | fallback-обёртки `int(x or 0) or _now_ts()`: `canvas_session:204,352,393,1103,1152,1234`, `ai:147,268`, `org_auth:851`, `audit_telemetry:238,252`, `platform:100` | не дубли, а fallback на B1 | секунды, UTC, int | ЭКВИВАЛЕНТ по построению (используют канонику); не трогаются |
| B5 | обёртки `str(_now_ts())`: `dictionaries:45,105,811` | не дубли | строка от канонического int | ЭКВИВАЛЕНТ по построению; не трогаются |

Исторические варианты из аудита — `datetime.now()` без tz, `.timestamp()` без
`int()`, локальное время — **в storage-домене отсутствуют** (скан подтверждает:
единственный `datetime.now` — в канонике B1 с `timezone.utc`). Из 5 вариантов
аудита к шагу 5a дожили только 2 фактических дубля (B2, B3), оба — эквивалентные
`int(time.time())`; остальные 3 были канонизированы ранее (B4/B5 — обёртки над
каноникой). Вариантов без `int()` или с локальной таймзоной для миграции нет.

## Сводка

- Row-мапперы: 25 определений → 3 ЭКВИВАЛЕНТ (канонический случай `dict(row)`), 22 ОТЛИЧИЕ (доменные DTO-проекции, не подлежат канонизации).
- `_now_ts`: 2 дубля `int(time.time())` — ЭКВИВАЛЕНТ, мигрированы; иных вариантов в домене нет.
- Миграция CRUD-блоков compat — шаг 5b, этот контур её не затрагивает.
