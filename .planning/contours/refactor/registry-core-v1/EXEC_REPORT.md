# EXEC_REPORT — refactor/registry-core-v1

Дата: 2026-09-14. Ветка: `refactor/registry-core-v1` (от `origin/main` = `2843f4d0`).

## Что сделано

### 1. Registry core (задачи 1–4)
- **Новый модуль** `backend/app/services/registry_core.py` (~570 стр.): `RegistryCoreConfig`, guards (`require_authenticated_user` → `request_active_org_id` → `require_org_member_for_enterprise`), нормализация scope/limit/offset, валидация project/session ids, агрегаты (summary/metrics/empty_state/source_state/session_summary*/reconcile/workspace_titles), `build_registry_payload()`, экспорт `csv_bytes`/`xlsx_bytes`/`xlsx_bytes_for`/`export_filename`, фабрики `make_query_endpoint`/`make_export_csv_endpoint`/`make_export_xlsx_endpoint`.
- **Адаптеры**: `routers/process_properties_registry.py` 1048→~570 стр. (остались: `_extract_camunda_rows`, `_parse_json_text`, `_compute_usage_counts`, `_enrich_metadata`, GET metadata query/export с xlsxwriter-веткой — второй движок НЕ объединён, байт-совместимость сохранена); `routers/product_actions_registry.py` 792→~500 стр. (остались: `_registry_row`, `_session_*`, `_step_action_counts`, GET view-model).
- `routers/_product_action_export_utils.py` **удалён** (правило единой реализации); импортёр `product_action_suggestions.py` переведён на registry_core (sheet «Product actions», widths из конфига).
- Новый тест `backend/tests/test_registry_core_contract.py` (5 passed + 4 subtests): sha256-совпадение с golden, интроспекция конфигов/endpoint-фабрик.
- Golden-bytes: CSV sha256 совпали точно; XLSX — канонический sha (структура zip) + raw-sha golden-файлов совпали. Дополнительно побайтовая сверка 30+ функций old-vs-new на синтетике — идентично.

### 2. orgs.py ↔ org_service.py (задача 5)
- org_service — канон: `_audit_log_safe` → импорт канона `services/audit.py` (копии также убраны в project_service.py); перенесены `_require_org_active_for_writes`, `_user_is_member_of_org`, `_request_org_candidates`, `_audit_retention_days` (принята робастная версия orgs.py `max(1,_env_int(...,90))`).
- orgs.py 1137→863 стр.: 15 клонов → делегирование к org_service, сигнатуры сохранены. Бизнес-логика вне orgs.py осталась только: invite-email flow (~120 стр.) и org session-report versions (~150 стр.) — вне приёмки.
- Импортёры `projects.py`, `sessions_core.py`, `session_service.py` переведены на org_service.
- Расхождения клонов (канонизировано): storage→project_repo; роли→utils.authz (ORG_*_ROLES); delete member ответ orgs `Response(204)` → service `{"ok": True}` — затрагивает только legacy-export путь (`LEGACY_ROUTE_EXPORT`), runtime-роутеры (`app.routers.*`) отдают ответ service-версии и до и после (см. риски).

### 3. analytics.py (задача 6) — NO-GO
Дифф контура достиг ~1660 строк → по go/no-go правилу вынесено в отдельный контур: `ANALYTICS_FOLLOWUP_PLAN.md` (задачи A–D, baseline 194 dup-строк, приёмка jscpd <5%).

## Доказательная модель (5 плоскостей)

1. **code**: ветка `refactor/registry-core-v1`, HEAD `2843f4d0` + working tree (до коммита на момент отчёта); diffstat: 10 файлов +167/−1495 (+новые: registry_core.py ~570, test_registry_core_contract.py; удалён _product_action_export_utils.py).
2. **workspace**: worktree `server-backup/opt/processmap-test-worktrees/refactor-registry-core-v1`; canonical checkout и другие worktrees не изменялись.
3. **DB**: миграции не трогались; alembic heads == 1 (проверка в pytest-контуре не затрагивалась; схема не менялась).
4. **env/compose**: docker-окружение не мутировало; все тесты in-process (venv canonical, SQLite-фикстуры). pm-env-lock не требовался.
5. **serving mode**: `scripts/dump_openapi.py --out docs/openapi.yaml` → **diff пуст** (302 paths / 382 operations неизменны); redocly lint (built-in recommended): **0 errors**; `test_route_compatibility.py` 6 passed (владельцы роутов `app.routers.*`, count==1); operation_id/теги не изменены (фабрики сохраняют `__name__`/annotations).

## Метрики приёмки

| Метрика | Baseline | После |
|---|---|---|
| jscpd PPR↔PAR (dup-строки) | 471 (25.60%) | 36 (4.05%) |
| jscpd orgs↔org_service | 273 (16.10%) | 84 (5.84%), кросс-модульных клонов **0** (все 8 оставшихся — внутрифайловые) |
| jscpd analytics self | 194 (10.74%) | — (отдельный контур) |
| orgs.py бизнес-логика | да | нет (только делегирование + invite/reports вне скоупа) |
| openapi.yaml drift | — | пустой diff |
| redocly lint | — | 0 errors |

## Тесты

- Baseline (main, без изменений): **1516 passed / 64 failed / 103 skipped** — 64 фейла pre-existing (env-зависимые: redis/deepseek/llm/meta и пр.), список: `baseline_failed_tests.txt`.
- После рефакторинга (таргетные): registry PPR 27, PAR 12, registry_core_contract 5+4 subtests, analytics_backend_driven 73+3, route_compat 6, fuzz B2/B3 12, org_visibility+openapi_rate_limit 9 — **все зелёные**.
- Полный прогон после рефакторинга: **1521 passed / 64 failed / 103 skipped / 20 subtests** (64:44). Сверка failed-набора с baseline: `new_failures: []`, `fixed_vs_baseline: []` — **регрессий нет** (+5 passed = новый test_registry_core_contract.py, +4 subtests).

## Риски / ограничения

- Legacy-export путь (`LEGACY_ROUTE_EXPORT`, не runtime): `DELETE .../members/{user_id}` теперь `200 {"ok": true}` вместо `204` — осознанная канонизация на org_service; HTTP-контракт runtime-приложения не изменён (оригинал в `app.routers.*` и до рефакторинга отдавал service-версию).
- Медленные registry API тесты (~50 мин на 39 тестов, ~65s на тест, CPU≈0) — pre-existing на HEAD, кандидат на отдельный perf-контур.
- Duplicate operation id warning (`delete_org_session_report_version`) при dump_openapi — pre-existing, на diff спеки не влияет.
- jscpd PPR↔PAR 4.05% — остаточное структурное сходство (endpoint-фабрики, pydantic-каркас), близко к ~0.

## Осталось

- Review (Agent 3) → push ветки, PR (рус.), mirror.
- **Merge — только после явного approve пользователя.**
- **Merge — только после явного approve пользователя.**
