# EXEC_REPORT — контур test/llm-test-generator

Ветка: `test/llm-test-generator` (worktree от `origin/main` 31d6256a, включает #700).
Дата: 2026-08-09.

## Резюме

Построен инструмент `scripts/llm_test_generator/`, который наращивает API-тесты
по данным покрытия: отбирает непокрытые операции из `api-coverage-results.json`,
собирает контекст из живой спеки ($ref-резолв), генерирует pytest-файл через LLM
(проектный OpenAI-compatible клиент) и пропускает через гейты, где **судья —
реальный прогон pytest**, а не самооценка модели.

**Первый батч: 5 операций тега notes → 5/5 тестов прошли гейты и вмержены в suite.**
Порог ТЗ (≥3 из 5) выполнен; цикл после починки работает устойчиво
(последние 2 цели — 2/2 с первой/второй итерации).

## Этап 0 — baseline покрытия

Полный прогон `pytest tests --api-coverage` + `api_coverage_report.py`:

| метрика | значение |
|---|---|
| operations_total | 329 |
| covered | 24 (7.3%) |
| partial | 59 |
| not_covered | 246 (exercised 25.2%) |
| calls_recorded | 382 (41 вне спеки) |

Снапшот: `build/api-coverage-results-baseline.json` (копия в `.planning/.../`).

## Этап 1 — инструмент

```
scripts/llm_test_generator/
  targets.py    — отбор целей: not_covered/partial, приоритет GET → whitelist POST;
                  исключения из exclusions.yaml (skip_operations, LLM-конверты) пропускаются;
                  spec-gap НЕ исключаем (доменные 4xx — полезные цели).
  context.py    — фрагмент живой спеки с $ref-резолвом (глубина/циклы/лимит),
                  канонический рабочий образец теста, точные сигнатуры хелперов,
                  образцы существующих тестов тега, непокрытые варианты (documented − seen).
  llm.py        — вызов через ПРОЕКТНЫЙ клиент app.ai.deepseek_questions._deepseek_chat_request
                  (sync, retry, usage); модель параметризуется (--model, env
                  LLM_TEST_GENERATOR_MODEL; нестандартная — адаптированная копия той же функции).
  gates.py      — py_compile → AST-запреты (assert True, pytest.skip, моки/patch,
                  requests/httpx/urllib, маркер обязателен, нужен ≥1 assert, ≥1 test_*)
                  → изолированный pytest-прогон. Падение → traceback обратно в LLM (макс. 3 итерации).
  generator.py  — оркестрация, needs_human.md, last_run.json, учёт токенов.
  generate.py   — CLI: --tag/--limit/--ops/--model/--api-key/--base-url/--dry-run.
```

Запреты ТЗ соблюдены: изменения только в `backend/tests/llm_generated/` и
`scripts/llm_test_generator/` (маркер `llm_generated` регистрируется локальным
conftest, pytest.ini не тронут); моки запрещены гейтом; тесты идемпотентны
(свежая SQLite per-test через isolate_process_db).

LLM: LiteLLM-прокси `https://vvchat.vkusvill.ru/red-mad-router`, модель
`deepseek-v4-flash` (ключ ограничен только ею).

## Первый батч (тег notes, 5 операций) — хронология

1. **Прогон 1: 0/5.** Стоп-разбор (как требует ТЗ):
   - reasoning-модель съедала `max_tokens=6000` на reasoning_tokens → пустой
     content → статик-гейт. Фикс: `max_tokens=16000` + content-gate «ответ не код»;
   - галлюцинированные сигнатуры хелперов (`create_org_record()` без аргументов,
     плейсхолдер `[[email_address]]`) → фикс: точные сигнатуры + канонический
     образец в промпте;
   - 2 цели упали на ConnectTimeout прокси (инфра, не цикл).
2. **Прогон 2: 3/5** (mentions, notifications, project note-aggregate; последний
   починен traceback-петлёй за 2 итерации).
3. **Ретрай 2 целей после доработки промпта** (workspace/folder-хелперы
   `create_workspace_record`/`create_workspace_folder`; семантика «404 ≠ 422»):
   **2/2** — folder note-aggregate с 1-й итерации, mentionable-users со 2-й
   (модель сама исправила ожидание 422 на реальный 404).

Итог: **5/5 целей покрыты, 9 тестовых функций, все зелёные в полном suite.**

## Этап 2 — дельта покрытия

Полный прогон (основной + contract + llm_generated): **26 failed / 1034 passed**
— 26 падений побайтово совпадают с pre-existing списком (pg/redis), падений
`llm_generated` — 0; было 1025 passed → стало 1034 (+9 новых тестов).

| метрика | было | стало | дельта |
|---|---|---|---|
| covered | 24 (7.3%) | 27 (8.2%) | **+3** |
| partial | 59 | 61 | +2 |
| not_covered | 246 | 241 | **−5** |
| percent_exercised | 25.2% | 26.7% | +1.5% |

По целям: note-mentions / note-notifications / folder note-aggregate → **covered**
(200+422); project note-aggregate → partial (200); mentionable-users → partial
(200+404; 404 незадокументирован — «covered» недостижим без доработки спеки).

## Стоимость LLM

25 вызовов (включая прогоны до починки цикла): prompt 85 071 + completion
173 431 ≈ **258.5K токенов** (deepseek-v4-flash, ~60% — reasoning).
Полезный батч после починки: 10 вызовов / ~75K токенов на 5 операций.

## Верификация (git-proof)

- `pytest tests` → 1034 passed, 26 failed (все pre-existing, список идентичен baseline);
- `pytest backend/tests/llm_generated` → 9 passed (в составе общего прогона);
- needs_human.md — пуст (все цели закрыты).

## Ограничения / follow-up

- Прокси периодически отдаёт ConnectTimeout (ретраи 3× не всегда спасают) —
  перезапуск цели `--ops` решает; в CI стоит прогонять генератор оффлайн-волной.
- 246 not_covered операций — масштабирование батчами по тегам (templates,
  explorer, analytics — следующие кандидаты); POST whitelist расширять по мере
  появления reset-фикстур.
- «partial» с незадокументированными статусами (404 у mentionable-users) —
  сигнал в spec-gap контур (#700), генератором не закрывается.
- Генератор не гейтит suite в CI (LLM-зависимость оффлайн): сгенерированные
  тесты — обычные pytest-файлы, попадают в общий прогон.
