# PR — feature/admin-dashboard-v2-feature-map

- PR: https://github.com/xiaomibelov/processmap_v1/pull/1007 (base: main, head: feature/admin-dashboard-v2-feature-map)
- Создан: 2026-09-21. HEAD при создании: 71ea5010 (8 коммитов от 2c051887).
- Состав: EXEC контура (REVIEW_PASS) + UX-итерация Вариант 1 (approved владельцем).
- Merge/deploy: только владельцем (AGENTS.md §7). Breaking-изменений API нет — маркер не нужен.

## CI-история
- backend-contract (contract fuzz): FAIL → root cause: `/api/openapi.json` отдаёт raw-спеку (get_openapi без build_ru_openapi), catalog роут не декларировал 403 → schemathesis status_code_conformance. Фикс: `responses={403: ...}` на GET catalog + PATCH/PUT (коммит 143ac88f). Enriched-спека не изменилась. Повтор CI: contract PASS (3m23s), все проверки PR зелёные.
