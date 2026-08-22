# EXEC_REPORT — контур test/llm-testgen-admin (admin-батч LLM-генератора)

Ветка: `test/llm-testgen-admin` (worktree от `origin/main` 7c4b8c88 — включает #703).
Дата: 2026-08-10. Продолжение контура test/llm-test-generator (#703).

## Резюме

Второй батч LLM-генератора — тег **admin** (platform-admin эндпоинты).
**7/7 целей прошли гейты, 13 новых тестов, needs_human пуст.**

## Доработки инструмента (по урокам батча)

1. `_TAG_RULES` в generator.py — тег-специфичные правила промпта. Для admin:
   `create_user(..., is_admin=True)` обязателен (иначе 403), негативный кейс 403
   через `is_admin=False`.
2. Правило 12 «не выдумывай недостижимые 4xx»: у `/api/admin/permissions` и
   `/api/admin/permissions/matrix` все query-параметры необязательные строки →
   задокументированный 422 недостижим реальными входами; модель 3 итерации
   пыталась его нащупать (включая `pytest.fail("Expected 422...")`). После
   правила — обе цели прошли (200 + структура ответа).

## Результаты батча

| Операция | Итог |
|---|---|
| GET /api/admin/audit | passed, 1 итерация |
| GET /api/admin/error-events | passed, 2 итерации (конверт `{ok, items}` ≠ list) |
| GET /api/admin/permissions | passed после правила 12 |
| GET /api/admin/permissions/entities | passed, 1 итерация |
| GET /api/admin/permissions/matrix | passed после правила 12 |
| GET /api/admin/permissions/matrix/bulk (POST) | passed, 1 итерация |
| GET /api/admin/permissions/matrix/{pt}/{pid}/{et}/{eid} | passed, 2 итерации |

`--ops` подстроки захватили 7 операций вместо 5 запланированных — принято.

## Дельта покрытия (после notes-батча → после admin-батча)

| метрика | было | стало | дельта |
|---|---|---|---|
| covered | 27 (8.2%) | 32 (9.7%) | **+5** |
| partial | 61 | 67 | +6 |
| not_covered | 241 | 230 | **−11** |
| percent_exercised | 26.7% | 30.1% | +3.4% |

(−11 not_covered при 7 целях: admin-тесты заодно дергают смежные эндпоинты.)

## Верификация (git-proof)

- `pytest tests/llm_generated` — 22 passed (9 notes + 13 admin).
- Полный прогон `pytest tests --api-coverage`: **1065 passed, 26 failed** —
  26 падений побайтово совпадают с pre-existing списком (pg/redis), новых нет.
- LLM: 20 вызовов ≈ 175K токенов (deepseek-v4-flash), включая отладку правила 12.

## Состав ветки (полный)

- `60c680b4` ci(testgen): workflow `llm-testgen.yml` — ручной запуск генератора
  (coverage → генерация → PR → артефакты)
- `2ac78ee1` feat(admin): API `/api/admin/testgen/*` — запуск через
  workflow_dispatch, учёт/синк статусов (sqlite testgen_runs)
- `c81e7070` test(admin): 13 кейсов на `/api/admin/testgen/*` (401/403/409/валидация)
- `e1beeedc` feat(admin-ui): карточка «Генерация API-тестов» в /admin/llm
- `3aac7e2b` feat: _TAG_RULES + правило «недостижимые 4xx»
- `792d560b` test: admin-батч — 7 операций, 13 тестов
- `51129ba1` docs: этот отчёт
- `ea83a884` docs(api): testgen в openapi.yaml-снапшот + spec-gap 404 waiver
  для `runs/{run_id}` (contract fuzz deterministic)

## Ограничения / follow-up

- Недостижимые задокументированные 422 (permissions, matrix) — сигнал в
  spec-gap контур: либо параметры сделать валидируемыми, либо 422 убрать/пометить.
- Остались admin-цели с seed-параметрами (agent-runs/{run_id}, ai/prompts/{id},
  error-events/{event_id}) — нужны seed-хелперы в промпт (append_error_event и пр.).
- sqlite-env admin-операции (llm providers/prompts/features/usage) по-прежнему
  вне контура (pg-only таблицы).

---

# Часть 2 — запуск генератора из админки (кнопка-пульт)

## Устройство запуска

```
Админка (/admin/llm?tab=testgen)                 GitHub Actions
┌──────────────────────────┐    workflow_dispatch    ┌────────────────────────┐
│ карточка «Генерация      │ ─────────────────────▶ │ llm-testgen.yml        │
│ API-тестов» (таб TestGen)│  POST /api/admin/      │ coverage → генерация → │
└──────────┬───────────────┘  testgen/run            │ ветка test/llm-gen-* + │
           │                       │                 │ PR с отчётом +         │
           │ GET runs[/id]         ▼                 │ артефакты              │
           │ ◀────────────  admin_testgen.py ◀───────┘ run-name [run_id],
           │  поллинг 12с      sqlite testgen_runs     PR «(run <id>, …)»
           │  (статусы         (queued/running/
           │   queued→running→ done/failed + pr_url)
           │   done/failed)
```

- **Workflow** `.github/workflows/llm-testgen.yml` — только `workflow_dispatch`
  (inputs: tag, limit, run_id). Шаги: валидация inputs (белый список тегов,
  limit 1..20, зеркало бэкенда) → deps → coverage baseline (pytest
  --api-coverage, как nightly) → генерация `scripts/llm_test_generator/` →
  прогон сгенерированных тестов в общий coverage → дельта → ветка
  `test/llm-gen-<run_id>-<ts>` + PR через gh с отчётом → артефакты
  (coverage before/after JSON, HTML, delta, needs_human.md, usage из
  last_run.json). `run-name` содержит маркер `[run_id]` — по нему бэкенд
  находит run через GitHub API.
- **Backend** `app/routers/admin_testgen.py` — генератор на сервере НЕ
  исполняется, только dispatch + учёт. Право = «API Docs» (is_admin или
  орг-роль org_owner/org_admin/auditor, фронт `canOpenOrgSettings`). 409 на
  дубль активного запуска по тегу. Синк статусов при чтении (best-effort:
  падение GitHub API не роняет GET). Токен: env `GITHUB_TOKEN`/`GH_PAT`,
  репозиторий `GITHUB_REPOSITORY` (default xiaomibelov/processmap_v1).
- **Frontend** — таб TestGen в `/admin/llm` (LLM-раздел админки): форма
  тег/батч, кнопка с состояниями (Запустить → Запуск… → Генерация идёт…),
  карточка активного запуска (статус, PR-ссылка, ошибка), история запусков,
  поллинг 12 сек пока есть активный. Без права таба/панели нет в DOM.

## Скриншоты

- `testgen-full.png` — страница /admin/llm?tab=testgen целиком (таб, карточка
  запуска, активный запуск running, история с done + PR-ссылкой).
- `testgen-panel.png` — только панель TestGen.

Снято на production-сборке фронта (`vite build` + `vite preview`) с моками
/api/* — соответствует реальному рендеру компонентов.

## Пример запуска на stage

**Блокер до мержа:** `workflow_dispatch` срабатывает только для workflow,
присутствующего в default-ветке (main). До мержа PR кнопка вернёт 502
(`github_dispatch_failed: github_api_404`) — запись помечается failed, повтор
не блокируется (проверено тестом `test_run_502_on_dispatch_failure`).

После мержа нужны секреты репозитория: `LLM_TESTGEN_API_KEY`,
`LLM_TESTGEN_BASE_URL` (+ опционально var `LLM_TESTGEN_MODEL`, default
deepseek-v4-flash) и `GITHUB_TOKEN`/`GH_PAT` на бэкенде (repo + actions RW).
Пример сгенерированного PR — см. #703-контур (notes-батч) и admin-батч выше:
именно такие PR будет создавать workflow автоматически.

## Верификация Части 2

- backend: `pytest tests/test_admin_testgen_api.py` — **13 passed** (401/403/
  валидация tag/limit/409/503/502/статусы queued→running→done/failed + PR,
  GitHub API замокан).
- frontend: `node --test src/features/admin/pages/AdminLlmPage.testgen.test.mjs`
  — **5 passed** (видимость по праву, состояния кнопки, POST с tag/limit, 409);
  существующий `AdminLlmPage.test.mjs` — 8 passed (не сломан).
- contract fuzz: 404 `runs/{run_id}` закрыт spec-gap waiver (фаззер детерминирован).
- spec-drift: docs/openapi.yaml дополнен 3 эндпоинтами + схемой TestgenRunBody.
- **Финальные регрессы на fa1d0ce8** (2026-08-10):
  - основной suite: **1078 passed, 26 failed** — список 26 побайтово идентичен
    baseline (pg/redis); `test_gate_010_twice_second_run_is_noop` — флаки
    (в одном прогоне 27-е падение, в повторном и при изоляции 3/3 — зелёный;
    не связан с изменениями ветки);
  - contract (pr-профиль): **142 passed** (fuzzed=133, +3 новые testgen-операции),
    404 `runs/{run_id}` под waiver — фаззер детерминирован;
  - CI #709: spec-drift pass, contract pass, nightly skipping (по дизайну).

## Ограничения / follow-up (Часть 2)

- Синк статусов опирается на маркер `[run_id]` в run-name и `(run <id>…)` в
  заголовке PR — если формат в workflow поменяется, синк сломается (держать
  зеркально).
- Белый список тегов дублируется в трёх местах (backend `_ALLOWED_TAGS`,
  workflow Validate inputs, фронт `TESTGEN_TAGS`) — при добавлении тега в
  спеку обновлять все три.
- workflow_dispatch из бэкенда требует токен с `actions:write` на репозиторий;
  задокументировать в deploy-чеклисте stage.
