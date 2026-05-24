# RUNTIME_CONTRACT_RECHECK_AFTER_RESTART

Статус: `PASS`
Run ID: `20260519T144354Z-91101`
Время: `2026-05-19T15:08Z`

## Причина повторной проверки

Agent 3 корректно заблокировал API gate: runtime `:5180/:8088` отдавал старый response shape, хотя source/tests уже содержали новые поля.

Причина найдена: на сервере были два compose project. Первый restart был выполнен для `processmap-test-api-1`, а активный gateway/runtime использует `processmap_test-api-1`.

## Исправление runtime

Выполнено:

```bash
cd /opt/processmap-test
docker compose -p processmap_test restart api
```

## Проверка

Authenticated query:

- `POST http://127.0.0.1:8088/api/analysis/product-actions/registry/query`
- `POST http://127.0.0.1:5180/api/analysis/product-actions/registry/query`

Оба runtime path вернули обязательные поля:

- `filter_options`
- `applied_filters`
- `metrics`
- `empty_state`
- `source_state`

`source_state`:

```json
{
  "source": "product_actions_registry_backend",
  "namespace": "/api/analysis/product-actions/registry",
  "heavy_payload_excluded": true,
  "mutation_allowed": false,
  "session_summary_source": "storage",
  "sessions_scanned": 2,
  "actions_scanned": 152
}
```

`metrics` sample:

```json
{
  "total_rows": 152,
  "filtered_rows": 152,
  "page_rows": 5,
  "projects_total": 1,
  "sessions_total": 1,
  "sessions_with_actions": 1,
  "sessions_without_actions": 1,
  "complete": 149,
  "incomplete": 3,
  "total_complete": 149,
  "total_incomplete": 3,
  "limit": 5,
  "offset": 0,
  "has_more": true
}
```

## Вывод

Runtime/API contract gate теперь пройден. Active `EXEC_PART_2_BLOCKED.md` должен быть снят с active gate и сохранен как superseded evidence.
