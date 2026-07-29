# E3.5 — AI-трансформация AS IS → TO BE draft: артефакты и отчёт

## Файлы артефактов
| Файл | Что это |
|---|---|
| `rules.yaml` | копия библиотеки правил трансформации (19 правил, source: `backend/app/transformation/rules.yaml`) |
| `transform_result.json` | результат конвейера для супа AS IS (`itmo_razogrev_v02.bpmn`): `as_is_ui_model`, `draft_ui_model`, `trace_map`, `open_questions`, `validation_report` |
| `golden_report.json` | golden-метрики vs экспертный TO BE (генерируется тестом `test_transformation_golden.py`) |
| `screen_transform_initial.png` | экран `/technologist/transform` до загрузки |
| `screen_transform_side_by_side.png` | side-by-side: AS IS слева, draft TO BE справа + решения + открытые вопросы |
| `screen_transform_trace_highlight.png` | подсветка derived_from связи при клике по элементу AS IS |
| `screen_transform_decisions.png` | список решений (accept/reject) и открытые вопросы (fullPage) |

## Реализация (код)
- `backend/app/transformation/rules.yaml` — 19 правил (map_to_operation / push_below / drop /
  extract_to_recipe / extract_to_contract / extract_to_event), rationale RU, format_ref § v0.3.
- `backend/app/transformation/rules_loader.py` — загрузка/валидация YAML, seed в таблицу.
- `backend/app/transformation/pipeline.py` — 3 слоя: extract_facts → match (deterministic + LLM
  DeepSeek, strict JSON, retries=1, offline→open_question) → build_draft (derived_from, trace map,
  open questions) + ОБЯЗАТЕЛЬНЫЙ валидатор (семантика bpmn_import; LLM proposes — validator rejects).
- `backend/app/routers/transformation.py` — `POST /api/process-templates/transform-asis`,
  `GET /api/process-templates/transformation-rules`, `POST .../transformation-rules/seed` (admin).
  Зарегистрирован POINT-правкой в `routers/__init__.py` ПЕРЕД process_templates (иначе
  `GET /{template_id}` перехватывает `transformation-rules`).
- `backend/alembic/versions/004_transformation_rule.py` — таблица `transformation_rule` (+downgrade);
  003 (E5) привязан к 004, single head сохранён. Применено к локальной БД, 19 правил засеяны.
- `backend/scripts/seed_transformation_rules.py` — seed YAML→таблица.
- `frontend/src/features/technologist/transform/TransformReview.jsx|css|test.mjs` — экран
  `/technologist/transform` (POINT-mount в RootApp), side-by-side GraphCanvas read-only,
  accept/reject по решениям, handoff `fpc_e4_handoff` в конструктор (контракт как у ImportBpmn).
- `frontend/src/lib/api.js` + `apiRoutes.js` — `apiTransformAsis`.

## Тесты
- `backend/tests/test_transformation_pipeline.py` — 12 тестов: библиотека правил, факты,
  детерминированный мэтчер, LLM strict-schema/отброс галлюцинаций, offline→open_question без падений,
  валидатор (коды/условия шлюзов/draft entities), полный прогон супа (0 ошибок, trace, recipe_context).
- `backend/tests/test_transformation_golden.py` — golden vs экспертный TO BE + smoke эндпоинта
  (реальный PG, токен technologist) + листинг правил.
- `frontend` vitest `TransformReview.test.mjs` — 5 тестов (upload, side-by-side, highlight, reject/accept, handoff).
- `npx vite build` — SUCCESS.

## LLM: использован или замокан
ЗАМОКАН. Реальный ключ DeepSeek из `/root/pm-e3/env.demo` возвращает **401 Authentication Fails**,
поэтому LLM-путь покрыт детерминированными fixture-ответами (`_llm_fixture`, `_canned_llm`).
Для супа LLM не требуется: все осмысленные задачи покрыты детерминированным мэтчером
(`llm_status=disabled`), 3 безымянные задачи оператора → `open_question` (не угадываем).
Offline-поведение (исключение/таймаут/401 → deterministic-only + open_question) покрыто тестами.

## Golden-метрики (суп AS IS → экспертный TO BE)
- `matched_decisions_pct` = **100.0** (23/23 решений по задачам AS IS совпали с экспертными)
- `false_carries_pct` = **0.0** (ничего лишнего не протащено)
- `missed_recipe_checks_pct` = **100.0** — ЧЕСТНО: в AS IS нет рецептурных проверок
  (`measure_temperature`, `check`), поэтому они не появляются в draft; конвейер НЕ выдумывает,
  а поднимает открытый вопрос OQ про проверку температуры и capability измерения (см. transform_result.json).
- Валидатор на draft: **0 ошибок**, 25 warnings (UNDECLARED_ENTITY_REF → draft_entities).

Расхождения (все в `golden_report.json → expert_only_not_derivable`): у эксперта есть элементы,
не выводимые из AS IS — measure_temperature + gateway, check + gateway, wait-события нагрева,
ветка дефекта тары (dispose + RESTART throw), второй start_equipment (догрев), +1 open/close_equipment.

## Замечания / отклонения
- **BACKEND RESTART NEEDED**: демо-backend :18011 не перезапущен (мне запрещено), поэтому
  `POST /api/process-templates/transform-asis` там отвечает 405. `transform_result.json` сгенерирован
  тем же кодом конвейера напрямую; скриншоты сделаны с перехватом ответа API (реальный UI по HMR).
  Эндпоинт верифицирован через TestClient-тест на реальном PG.
- `frontend/src/features/technologist/recipes/Recipes.test.mjs` (чужой, E5, untracked) содержит
  сырой JSX в `.mjs` и падает при парсинге vitest — НЕ связано с E3.5.
- Ключ DeepSeek 401 — нужен валидный ключ для live LLM-режима.
