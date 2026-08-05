# ТРЕК LLM: единая LLM-инфраструктура + админка + три поверхности
# ПЛАН — АПРУВЛЕН владельцем 2026-08-04 С ЗАМЕЧАНИЯМИ (см. ниже). Дата: 2026-08-04.

## РЕШЕНИЯ ВЛАДЕЛЬЦА ПО АПРУВУ (2026-08-04)
1. SDD-аудит и спека «Workflow для технолога ред. 2» — владелец передаст
   отдельно. **LLM0 НЕ стартовать до их получения**; до этого — только
   черновики миграции 012 и схем БЕЗ коммита.
2. Этот PLAN.md закоммичен в репо как артефакт трека (docs/llm/).
3. L3 лимиты ПРИНЯТЫ: daily 200k/300k/100k (analysis/transform/assistant),
   max_tokens 4000/2000/800.
4. L4 ПОДТВЕРЖДЁН: LLM-разбор — отдельный блок, не замена существующей аналитики.
5. Gate LLM1: сверка, что кнопка «Анализ LLM» попадает именно во вкладку
   «Анализ процессов» — по скрину владельца (приложить скрин к PR LLM1).
6. llm_providers — мульти-провайдер: строка = (base_url, api_key, model,
   priority, enabled); порядок фолбэка = priority, редактируется из админки
   без редеплоя.
7. **БЛОКЕР ПРОД-ДЕПЛОЯ (2026-08-05): до мержа PR «F1–F3 устойчивость
   миграций» (fix/migrations-idempotency-and-observability: идемпотентная 010
   + маркеры db_bootstrap + migrations в /api/health) LLM-код на прод НЕ
   выкатывается.** Основание: инцидент 04.08 (degraded-старт, 012 не
   применилась), вердикт — docs/deploy/STAGE_DEGRADED_START_ROOT_VERDICT.md.

Режим: план → апрув владельца → реализация по эпикам, каждый эпик — отдельный
PR с протоколом апрувов. Артефакты — docs/llm/. Секреты не публикуются.

---

## ИСТОЧНИКИ И ТРАКТОВКА (пакет спеки получен 2026-08-04, docs/spec/)

Владелец передал 4 документа, закоммичены в `docs/spec/`:
1. `WORKFLOW_TECHNOLOGIST_SPEC_V2.md` — спека «Workflow для технолога», ред. 2.
2. `WORKFLOW_TECHNOLOGIST_EPICS.md` — эпики E1–E9 + протокол апрувов.
3. `WORKFLOW_TECHNOLOGIST_TOBE_SOUP_ANALYSIS.md` — «Анализ и доработка процесса
   TO BE разогрева супа» (маппинг v0.2→v0.3, ошибки потока, открытые вопросы).
4. `WORKFLOW_TECHNOLOGIST_E1_APPROVAL.md` — апрув E1 с замечаниями E2.0a/E2.0b
   (прецедент протокола: артефакт = файл, не пересказ; 403-by-role автотесты).

**Трактовка источников (при конфликте):**
- **Спека (docs/spec/) = истина** по ролям, UX, жизненному циклу
  (черновик → валидация → публикация → пилот → эксплуатация), протоколу апрувов.
- **As-built (docs/w4, docs/ol1, код) = истина** по механике сессий и хранения
  (sessions, process_layer as_is/to_be, derived_from_session_id, overlay OL1).

**⚠️ Расхождения спека vs as-built — фиксировать, НЕ разрешать молча:**
- Главное: спека описывает **process_template-модель** (process_template, recipe,
  process_entity, operation_catalog, quality_policy, sku_binding, audit_log —
  сущности E1/E2), а реализованная механика — **сессионная** (W4: сессия как
  контейнер, слои as_is/to_be, derived_from_session_id). Это разные модели
  данных; LLM-эпики строятся на сессионной модели (как есть), а каждое касание
  границы с template-моделью фиксируется ⚠️ в отчёте эпика с явным решением
  владельца. Молча «свести» модели в коде запрещено.
- «Режим технолога в общем редакторе» (спека) vs отдельные экраны контура
  (TransformReview и др.) — UX-решения LLM1–LLM3 сверяются со спекой, точки
  встройки — с as-built (InterviewStage, TransformReview).
- Каждое новое расхождение, найденное в работе, добавляется в этот раздел
  со статусом ⚠️ и датой.

**Роль «Анализа TO BE супа» для LLM2:** документ — основа библиотеки правил
(rules.yaml) и промта трансформации: таблица маппингов v0.2→v0.3 (раздел 3),
10 логических ошибок потока (раздел 4) и «что НЕ перенесено из AS IS»
(раздел 5) — это готовые экспертные решения того же типа, что EXPERT_DECISIONS
в golden-фикстуре. При старте LLM2: BPMN-эталон v0.3 взять из
`Downloads/Kimi_Agent_Техворкфлоу/` (35 узлов/36 потоков, 0 критичных
несоответствий) и сверить rules.yaml/промт с разделами 3–5 анализа.

---

## 0. ЧТО УЖЕ ЕСТЬ И ПЕРЕИСПОЛЬЗУЕТСЯ (Шаг 0, по коду main@b0a0abb3)

**Backend `backend/app/ai/` — 80% инфраструктуры LLM0 уже существует:**
- `deepseek_client.py` / `deepseek_questions.py` — HTTP-клиент DeepSeek
  (`requests`, не SDK): `_deepseek_chat_request` (:773) с retry-конвенцией
  (429/5xx/timeout, `_is_retryable_deepseek_error` :751), strict JSON,
  timeout 30с. Env `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`.
- `execution_log.py` — AI execution log в БД + rate limits
  (`DEFAULT_AI_RATE_LIMITS`: 60/час default, 20/час path_report).
- `prompt_registry.py` — версионирование промптов (draft/active/archive).
- `settings.py` — `load_llm_settings`/`verify_llm_settings` (health-check
  с latency); переопределение файлом `_llm_settings.json` (file > env > default).
- `module_catalog.py` — сводка настроек провайдера; ключ никогда не отдаётся
  наружу — только `has_api_key: bool` (admin.py:897 `result.pop("api_key")`).
- Живые LLM-фичи: `POST /api/sessions/{id}/ai/questions`,
  `notes/extraction-preview|apply`, `path_report`.
- Паттерн деградации: `extract_process_preview` → `{source: llm|fallback, …}`
  + детерминированный stub (`_stub_extract_v2`), сбой LLM → `llm_status="offline"`,
  НИКОГДА не угадываем — open_question.

**E3.5 трансформация (`backend/app/transformation/`):**
- `pipeline.py` (740 строк): 3 слоя — extract_facts → match (deterministic по
  rules.yaml, LLM только для нераспознанных, retries=1) → build_draft +
  обязательный валидатор («LLM proposes — validator rejects», до 3 итераций).
- Точка замены mock→live: `transform_asis(..., llm_call=...)` (pipeline.py:698),
  дефолт `_default_llm_call` (:184). Контракт: `{"matches":[{element_id, rule_id|null,
  confidence}]}`; неизвестные id отбрасываются (анти-галлюцинации).
- `rules.yaml` — 19 правил R01–R19 + таблица transformation_rule + seed.
- Golden: `backend/tests/test_transformation_golden.py` + fixtures
  `itmo_razogrev_v02.bpmn` vs `tobe_razogrev_supa_rtk_v03.bpmn` + EXPERT_DECISIONS
  (23 решения), метрики matched=100%/false_carries=0%.
- Экран: `frontend/src/features/technologist/transform/TransformReview.jsx`
  (accept/reject, derived_from-подсветка, handoff `fpc_e4_handoff` в конструктор).

**Доменный формат v0.3:** 14 разрешённых кодов (`validation/service.py:45`
ALLOWED_OPERATION_CODES; в сиде физически 13 — `hold` не засеян, расхождение
зафиксировано), FORBIDDEN=`{"package_meal"}` + placeholder `"-"`; канонические
схемы параметров — `seed_operations.py:347` V03_PARAMETER_SCHEMA.

**Вкладка «Анализ процессов»:** `InterviewStage.jsx` (~1100 строк); блоки:
BoundariesBlock, ProductActionsPanel, RagSearchPanel, InterviewPathsView,
ExceptionsBlock, AiQuestionsBlock (:1143). Точка встройки «Анализ LLM» —
рядом с AiQuestionsBlock. API-клиенты: `lib/api.js:2056` apiTransformAsis,
`lib/apiRoutes.js:151`.

**Инфра-паттерны для LLM0:** admin API — `routers/admin.py` с
`_platform_admin_context`; миграции — стиль 011 (idempotent, dup-check);
кэш — Redis `pm:cache:analytics:…:v1:{sha256}` (analytics_cache.py:17);
контракт-тесты — `tests/test_api_contracts.py` (shape: точный набор ключей+типы);
моки внешних HTTP — `test_deepseek_retry.py` (`unittest.mock.patch` на requests.post).

**Пробелы/риски (входные условия):**
- ~~SDD-аудит и спека НЕ найдены~~ → **ПОЛУЧЕНЫ 2026-08-04**, см. раздел
  «ИСТОЧНИКИ И ТРАКТОВКА» выше; расхождения со спекой — там же, ⚠️-протокол.
- Реальный ключ DeepSeek из env.demo → 401 (нужен валидный ключ для golden на stage).
- `hold` в ALLOWED, но не засеян (мелкий баг сида — отдельная строка в LLM0).

---

## ЭПИК LLM0. Инфраструктура + админка — оценка **M** (1 PR)

### Схема БД — миграция `012_llm_infrastructure` (стиль 011, idempotent)
```sql
llm_providers(
  id TEXT PK, org_id TEXT NOT NULL DEFAULT 'org_default',
  name TEXT NOT NULL,                 -- 'deepseek-main'
  base_url TEXT NOT NULL,             -- https://api.deepseek.com
  api_key TEXT NOT NULL,              -- хранится в БД, НЕ отдаётся наружу
  model TEXT NOT NULL,                -- deepseek-chat
  priority INT NOT NULL DEFAULT 100,  -- меньше = раньше
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT, created_at BIGINT, updated_by TEXT, updated_at BIGINT,
  UNIQUE(org_id, name)
)
llm_prompts(
  id TEXT PK, feature TEXT NOT NULL,  -- process_analysis|as_is_transform|schema_assistant
  version INT NOT NULL,
  system TEXT NOT NULL, template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft|active|archive (из prompt_registry)
  max_tokens INT NOT NULL DEFAULT 2000,
  model_class TEXT NOT NULL DEFAULT 'primary', -- primary|cheap (маршрутизация фичи)
  updated_by TEXT, updated_at BIGINT,
  UNIQUE(feature, version)
)
llm_usage(
  id BIGSERIAL PK, org_id TEXT, feature TEXT NOT NULL, model TEXT,
  provider_id TEXT, prompt_tokens INT, completion_tokens INT,
  cached BOOLEAN NOT NULL DEFAULT false,   -- true = 0 токенов (критерий 4)
  user_id TEXT, project_id TEXT, session_id TEXT,
  latency_ms INT, status TEXT NOT NULL DEFAULT 'ok', -- ok|error|rate_limited|no_provider
  ts BIGINT NOT NULL
) + INDEX(org_id, feature, ts), INDEX(feature, ts)
llm_feature_flags(
  feature TEXT PK, enabled BOOLEAN NOT NULL DEFAULT true,
  daily_token_limit INT NOT NULL DEFAULT 200000,  -- L3: черновой лимит
  updated_by TEXT, updated_at BIGINT
)
```

### LLM Gateway Service (server-side only) — `backend/app/ai/gateway.py`
- `complete(feature, payload, *, user, project, session) -> GatewayResult`:
  1. feature flag enabled? → иначе `{status:"disabled"}`;
  2. суточный лимит токенов по фиче (SUM llm_usage за 24ч) → `{status:"rate_limited"}` (понятное сообщение, НЕ 500);
  3. активный промт (llm_prompts active, max version) → env-fallback;
  4. провайдеры по priority, enabled → фолбэк цепочка; ни одного → `{status:"no_provider"}` — фича честно «LLM не настроен»;
  5. вызов через существующий retry-клиент (паттерн `_deepseek_chat_request`);
  6. запись в llm_usage (cached=false) всегда, включая ошибки.
- `complete_cached(feature, projection_md5, ...)`: Redis-ключ
  `pm:cache:llm:{feature}:v1:{md5(projection+prompt_version+model)}` — hit →
  запись llm_usage(cached=true, tokens=0) + ответ из кэша (критерий 4).
- Ключ провайдера читается из БД на каждый вызов (редактируется без редеплоя,
  критерий 2); env `DEEPSEEK_API_KEY` — только фолбэк при пустой таблице.
- Существующие фичи (ai/questions, path_report, notes/extraction) НЕ
  переписываются в LLM0 (без регрессий); gateway — для новых фич, миграция
  старых — отдельным решением.

### API (в `routers/admin.py`, гейт `_platform_admin_context`; вызовы фич — analyst/technologist)
```
GET/POST        /api/admin/llm/providers            (список БЕЗ api_key: has_api_key + last4)
PATCH/DELETE    /api/admin/llm/providers/{id}
POST            /api/admin/llm/providers/{id}/test  (verify_llm_settings-паттерн: latency_ms, preview)
GET             /api/admin/llm/prompts?feature=     (версии)
POST            /api/admin/llm/prompts              (новая версия, draft)
POST            /api/admin/llm/prompts/{id}/activate  (атомарно: старая → archive)
POST            /api/admin/llm/prompts/{id}/rollback  (activate старой версии)
GET/PATCH       /api/admin/llm/features             (флаги + лимиты)
GET             /api/admin/llm/usage?from&to&feature&model  (агрегации по дням/фичам/моделям)
```
Контракты — снапшот shape-тесты (`test_api_contracts.py`-паттерн). Ключ нигде:
ни в GET, ни в логах (запретить print/logger тела запроса к провайдеру —
assert в тесте), ни в телеметрии.

### Админ-панель, раздел «LLM» (новый подраздел `features/admin` по 5-точечной схеме)
- **Провайдеры**: таблица (name, base_url, model, priority, enabled, ключ
  `•••abcd`), кнопки: добавить/редактировать/отключить/«Проверить» (тестовый
  вызов → latency + статус).
- **Промты**: селект фичи → список версий (status, updated_by/at), редактор
  (system + template + max_tokens + model_class), «Активировать», «Откат»,
  diff версий (простой side-by-side).
- **Фичи**: переключатели enabled + поле daily_token_limit.
- **Расход**: фильтры (период, фича, модель) + таблица по дням: tokens in/out,
  cached-hits (0 токенов), ошибки; сумма за период.
- i18n: все строки через словари ru/en (паттерн существующего features/admin).

### Критерии приёмки LLM0 (чек-лист)
- [ ] Миграция 012 идемпотентна; `alembic upgrade head` на копии прод-схемы зелёный
- [ ] Ключ редактируется в админке, без редеплоя; GET не отдаёт ключ (тест: нет api_key в ответе); last4-маска
- [ ] Промт: новая версия → activate → gateway берёт её; rollback работает (тест)
- [ ] Нет активных провайдеров → complete() = `no_provider`, UI «LLM не настроен», система работает как раньше (тест)
- [ ] Лимит токенов/сутки: исчерпание → `rate_limited` + понятное сообщение, не 500 (тест)
- [ ] llm_usage пишется на каждый вызов; cached-hit → tokens=0 (лог в тесте)
- [ ] Backend pytest: дельта к baseline пустая; новые эндпоинты — shape-тесты
- [ ] mock E3.5 не тронут; i18n ru/en; RBAC admin-only на управление

---

## ЭПИК LLM1. Анализ процессов — оценка **M** (1 PR, после апрува LLM0)

- **Кнопка «Анализ LLM»** в InterviewStage (рядом с AiQuestionsBlock :1143),
  только по клику, confirm при повторном расходе (есть свежий кэш → предложить кэш).
- **Сериализатор проекции** `backend/app/ai/process_projection.py` (отдельный
  модуль + тест): из ui_model/XML сессии → компактный JSON:
  `{steps:[{id,type,name_ru,duration,role,operation_code?}], edges:[{from,to}],
  meta:{session_id, rev, nodes_count}}` — НЕ сырой BPMN-XML (экономия №1).
- **Эндпоинт** `POST /api/sessions/{id}/llm/analysis` (analyst/technologist):
  1. проекция → md5 → `complete_cached("process_analysis", md5)` — неизменная
     схема → 0 токенов (критерий 4); `?force=1` — «Обновить» (критерий «по клику»);
  2. промт из llm_prompts(feature=process_analysis, active) — редактируемый;
  3. **JSON-схема ответа** (валидируется, кривой/частичный → честный статус
     `partial` + что распарсилось, НЕ падение):
     `{bottlenecks:[{step_id, reason, severity}], robotization_candidates:
     [{step_id, operation_code (ТОЛЬКО из 14 разрешённых), rationale}],
     risks:[{text, severity}], open_questions:[{text}]}`;
  4. анти-галлюцинации: step_id ∉ проекции → отбрасывается; operation_code ∉
     каталога → отбрасывается (паттерн pipeline.py); запрещённые поля v0.3
     запрещены и здесь.
- **Фронт**: блок «Анализ LLM» под кнопкой — секции Узкие места / Кандидаты
  на роботизацию (код + расшифровка из каталога) / Риски / Открытые вопросы;
  статусы: loading / ok / partial / cached / no_provider / rate_limited.
- **Ответ на L4** (по умолчанию): **отдельный блок** рядом с существующей
  аналитикой, не замена (существующее не ломаем).

### Критерии LLM1
- [x] Сериализатор: тест на фикстуре (проекция, стабильный md5; digest не зависит от session_id/rev) — `test_process_projection.py` 6/6
- [x] Повторный анализ неизменной схемы = 0 токенов (complete_cached → cached=true, usage 0; контракт — `test_repeat_uses_cache_zero_tokens`, логи llm_usage — гейтвей-тесты LLM0) — лог со stage приложить на гейте
- [x] Кривой JSON от LLM → статус partial, UI не падает (backend `test_malformed_json_is_partial_not_crash` + frontend `partial` в `llmAnalysisView.test.mjs`)
- [x] Галлюцинированные step_id/operation_code отброшены (`test_antihallucination_filter`: шаг-призрак + package_meal + код вне каталога, dropped=3)
- [x] Только по клику: ни одного фонового/авто-вызова (`llmAnalysisBlock.source.test.mjs`: нет useEffect, apiLlmAnalysis только в run())
- [x] shape-тест эндпоинта (`test_shape_ok` + роут зарегистрирован); регрессии пустые (backend 26≡26, frontend 61≡61); i18n — блок следует стилю InterviewStage (русские строки, как соседние блоки)
- [x] Gate: скрин кнопки во вкладке «Анализ процессов» на stage — **ПРОЙДЕН 2026-08-05** (артефакты `docs/llm/gate/`):
  (1) `/api/health.migrations` = `{013, 013, ok:true}`, status ok — самолечение F1–F3: 013 применилась сама при деплое;
  (2) кнопка на месте (llm1_gate2_button.png); (3) живой прогон + повтор → cached=true,
  llm_usage: calls=3, cached_hits=1, errors=0, повтор 0 токенов (llm1_gate3_*.png);
  (4) force с inline-confirm (llm1_gate4_*.png).

## BACKLOG
- LLM-эндпоинты — переход на RBAC при появлении ролей в backend-auth
  (зафиксировано при мерже LLM1: гейтинг сейчас org-scoped, как у всех session-эндпоинтов).

---

## ЭПИК LLM2. Live-трансформация TO BE — оценка **M** (1 PR, после апрува LLM1)

- Замена mock: `_default_llm_call` (pipeline.py:184) → вызов через gateway
  `complete("as_is_transform", …)`; сигнатура и контракт `matches[]` НЕ меняются
  (pipeline, валидатор, trace_map, derived_from, open_questions — без изменений).
- Библиотека правил остаётся первым слоем; LLM — только нераспознанные
  (как сейчас) + разрешение неоднозначностей (tie между правилами → LLM-арбитр
  с confidence; ниже порога → open_question, не угадывание).
- `no_provider`/ошибка → `llm_status="offline"` + open_questions — текущее
  поведение сохраняется (mock НЕ удаляем — фолбэк, критерий 5).
- **Golden-тест — gate эпика**: прогон `test_transformation_golden.py` на stage
  с реальным ключом: matched_decisions_pct ≥ 100% эталона (как сейчас),
  false_carries_pct = 0; в CI — замоканный gateway (`_llm_fixture`-паттерн);
  golden-прогон записывается в `docs/llm/golden_llm2_report.json`.
- Решения — только через TransformReview (accept/reject); LLM не пишет в
  схему напрямую (критерий «не ломать»).

### Критерии LLM2
- [ ] Без ключа: pipeline работает как раньше (offline + open_questions) — тест
- [ ] С ключом (stage): golden метрики не хуже эталона; отчёт в docs/llm/
- [ ] derived_from/trace_map инвариантны (дифф transform_result до/после — структура та же)
- [ ] Токены: LLM вызывается только для unmatched/tie (лог llm_usage: счётчик вызовов ≤ N на golden-фикстуру)
- [ ] CI зелёный с замоканным gateway; регрессия пустая

---

## ЭПИК LLM3. Помощник на Схеме / в TO BE-конструкторе — оценка **S** (1 PR, после апрува LLM2)

- Три действия, только по клику, дешёвая модель (model_class=cheap), жёсткий
  max_tokens (≤800), stateless:
  1. «Предложить следующий блок» — из каталога операций (14 кодов), кандидат
     вставляется только через существующие механизмы конструктора (accept/reject);
  2. «Объяснить AI-решение» по шагу (rationale из trace_map + LLM-пересказ);
  3. «Спросить про шаг» (выделенный шаг → Q&A, контекст = проекция шага, не вся схема).
- Эндпоинты: `POST /api/sessions/{id}/llm/suggest-next`, `/llm/explain-step`,
  `/llm/step-qa` — все через gateway с feature=schema_assistant, кэш по md5.
- Запрещённые поля v0.3 фильтруются и здесь.

### Критерии LLM3
- [ ] Все вызовы по клику; max_tokens ≤ 800; cheap-модель из конфига фичи
- [ ] Кандидаты только из каталога (фильтр-валидация, тест)
- [ ] no_provider/rate_limited — честные статусы в UI
- [ ] shape-тесты; i18n; регрессия пустая

---

## ЭКОНОМИЯ ТОКЕНОВ (сквозная, проверяется в каждом эпике)
1. Проекция вместо XML (LLM1: сериализатор + тест размера — проекция ≤ 4KB на эталонной схеме).
2. Кэш md5(проекция+версия промта+модель) — Redis, TTL 7д; cached-hit = 0 токенов + llm_usage(cached=true).
3. Вызовы только по действию пользователя; автоповторов нет; retry — только внутри gateway (429/5xx, ≤2).
4. Две модели (cheap/primary) — model_class в llm_prompts, маршрутизация в конфиге фичи.
5. max_tokens на ответ (в промте) + daily_token_limit на фичу (исчерпание → rate_limited-сообщение, не 500).
6. Полный учёт llm_usage + экран расхода (LLM0).
7. Stateless, без истории, без streaming.

## НЕ ЛОМАТЬ (регрессионный периметр каждого PR)
Хост-канвас (bpmn.io, версии, экспорты), XML E7 + round-trip, Validation E6,
RBAC, i18n, overlay OL1, read-only AS IS (md5-инвариант), save-путь
(FIX-SAVE P2–P6), mock E3.5 как фолбэк. LLM-вывод никогда не пишется в схему
напрямую — только конструктор/derived_from/accept-reject. Backend pytest —
дельта к baseline пустая; новые эндпоинты — shape-тесты.

## ПОСЛЕДОВАТЕЛЬНОСТЬ PR
1. PR LLM0 (миграция 012 + gateway + admin API + админка + тесты) — M
2. PR LLM1 (проекция + analysis + UI-блок + тесты) — M
3. PR LLM2 (live transform + golden на stage) — M
4. PR LLM3 (помощник, 3 действия) — S
Каждый PR: протокол апрувов, артефакты в docs/llm/, регрессия backend pytest.

## ОТКРЫТЫЕ ВОПРОСЫ (предложения по умолчанию — на апрув)
- **L1 Провайдеры для сидов**: сидить ОДНУ строку-заглушку `deepseek-main`
  (base_url=https://api.deepseek.com, model=deepseek-chat, priority=100,
  enabled=false, api_key='') — ключ вносит админ через админку. Сиды без
  реальных ключей (секреты не в репо).
- **L2 Старт трека**: планирование — сейчас; реализация LLM0 — после зелёного
  прода (прод стабилизирован 2026-08-04, main@5d3f37f7 выкачен) → стартуем
  немедленно после апрува плана.
- **L3 Черновые лимиты**: process_analysis 200k токенов/сутки, as_is_transform
  300k, schema_assistant 100k; max_tokens ответа: analysis 4000, transform 2000,
  assistant 800. Корректируются в админке без редеплоя.
- **L4 Разбор — отдельный блок** рядом с существующей аналитикой (не замена).

## ВХОДНЫЕ МАТЕРИАЛЫ — СТАТУС
Спека, эпики, апрув E1 и «Анализ TO BE супа» — **получены 2026-08-04** и
закоммичены в `docs/spec/` (см. «ИСТОЧНИКИ И ТРАКТОВКА»). LLM0 разблокирован.
Остаётся: валидный ключ DeepSeek для golden-прогона на stage (через админку
после LLM0, не в репо).
