# EXEC_REPORT: fix/endpoint-check-id-resolution

## Цель
Устранить первопричину ложных 404 в регрессионном сканере ProcessMap:
- привязать resolved id к текущей org,
- добавить probe-проверку resolved id с rediscovery,
- внедрить flap-detection и UI-фильтр Flaky,
- сохранить backward-совместимость API и пройти регресс-тесты.

## Что сделано

### Backend
1. **`backend/app/endpoint_check/service.py`**
   - `_resolve_ids_from_db` теперь возвращает `(context, missing_keys)` и фильтрует `session_id`/`project_id` по `org_id`, `folder_id` по `org_id + workspace_id`. Глобальный fallback на чужие org удалён.
   - Добавлена `_probe_resolved_ids`: пробный GET `/api/sessions/{session_id}` (и project/folder); при 404/403 ключ сбрасывается, запускается discovery, повторная проба; лимит 2 попытки.
   - В `execute_run` последовательность: `_resolve_ids_from_db` → discovery → probe; `missing_ids` обновляется после probe.
   - `blind_zone` для unresolved параметров теперь содержит причину `в орг {org_id} нет данных для: ...`.
   - `summary` дополнен `probe_duration_ms`, `missing_ids` и счётчиком `flaky`.

2. **`backend/app/endpoint_check/diff.py`**
   - Добавлены константы `FLAP_THRESHOLD = 2`, `FLAP_WINDOW_RUNS = 5`.
   - Добавлена `is_flaky(history_categories)`: переходы ok↔error в окне последних 5 прогонов.

3. **`backend/app/endpoint_check/store.py`**
   - Добавлена `get_recent_done_runs(limit)` для истории flap-detection.

4. **`backend/app/endpoint_check/service.py` — `_store_results_with_diff`**
   - Загружает последние 5 done-прогонов.
   - Для каждой текущей записи строит историю категорий; если `is_flaky` true и текущая категория не ok — `diff_status` заменяется на `"flaky"` с пояснением в note.
   - `diff_counters` автоматически видит `flaky`; в `counts` добавлен отдельный счётчик.

### Frontend
5. **`frontend/src/features/admin/llm/endpointCheckModel.js`**
   - `ENDPOINT_CHECK_FILTER_FLAKY`, `endpointCheckDiffGroup` возвращает `"flaky"`, фильтр и сводка учитывают flaky.

6. **`frontend/src/features/admin/llm/EndpointCheckPanel.jsx`**
   - Кнопка фильтра «Flaky» с счётчиком.
   - Amber-бейдж «Flaky» в заголовке карточки и amber-стиль у строки таблицы.
   - Сводка: `· N flaky` отдельно от ошибок.

7. **`frontend/src/features/admin/llm/i18n/{ru,en}.js`**
   - Строки для фильтра, бейджа и сводки Flaky.

### Тесты
8. **`backend/tests/test_admin_endpoint_check.py`**
   - `test_resolve_ids_from_db_filters_by_org` — проверка org-фильтрации.
   - `test_probe_resolved_ids_rediscovery_on_404` — 404 → rediscovery → успех.
   - `test_probe_resolved_ids_gives_up_when_discovery_empty` — «нет данных».
   - `test_flap_detection_*` (4 теста) — конечный автомат flaky.
   - `test_store_results_with_diff_does_not_mark_ok_as_flaky` — ok не становится flaky.
   - Итого: **27/27 passed** (было 19, добавлено 8).

9. **`frontend/src/features/admin/llm/endpointCheckModel.test.mjs`**
   - Тесты фильтра Flaky, diff-группы, сводки.
   - Итого: **19/19 passed**.

10. **Frontend build** — `npm run build` прошёл успешно.

## Git proof

```
branch:   fix/endpoint-check-id-resolution
HEAD:     1db31407c768cfcbb48f23390478a0650a5098c0
origin/main: 037ae13b608c71512606761e65e5b9674d8c9494
status:   clean
```

*(SHA HEAD будет обновлён после push; актуальное значение см. `git rev-parse HEAD`.)*

## Изменённые файлы

```
backend/app/endpoint_check/diff.py
backend/app/endpoint_check/service.py
backend/app/endpoint_check/store.py
backend/tests/test_admin_endpoint_check.py
frontend/src/features/admin/llm/EndpointCheckPanel.jsx
frontend/src/features/admin/llm/endpointCheckModel.js
frontend/src/features/admin/llm/endpointCheckModel.test.mjs
frontend/src/features/admin/llm/i18n/en.js
frontend/src/features/admin/llm/i18n/ru.js
```

## Риски и ограничения
- **API не изменился**: новое значение `diff_status = "flaky"` — допустимая строка, совместимая с existing consumers.
- **Flap-detection** работает только при наличии ≥ 2 завершённых прогонов в окне 5; первые прогоны после внедрения будут классифицироваться по старой схеме.
- **Probe** увеличивает время прогона на 1–3 дополнительных HTTP-вызова; latency учитывается отдельно (`probe_duration_ms`), не попадает в latency эндпоинтов.
- **Stage-верификация** требуется после merge: прогон сканера 2 раза, ожидается стабильный diff и ~122 ok.

## Следующие шаги
1. Сделать коммит и push ветки `fix/endpoint-check-id-resolution`.
2. Создать PR; merge — только после явного approve пользователя.
3. После merge выполнить stage-верификацию:
   - POST `/api/admin/endpoint-check/run` → дождаться done.
   - Повторить → зафиксировать стабильность диффа.
   - Сравнить цифры с baseline 27.08 (122 ok).
4. Объявить новый прогон baseline для endpoint-check.
