# LLM0 — GATE-ЧЕКЛИСТ К АПРУВУ PR

Дата: 2026-08-04. Ветка: `feat/llm0-gateway-admin`. Основание: `docs/llm/PLAN.md`
(критерии приёмки LLM0) + указание владельца (5 пунктов gate, артефакт на каждый).

Протокол: каждый пункт — ✅/❌/⚠️ + артефакт-файл/вывод (текстовый пересказ
артефактом не является). Секреты не публикуются (в тестах — только фейковые
значения вида `sk-supersecret-…`, не боевые ключи).

---

## Гейт 1. Маскирование ключа в API — ✅

**Требование:** ключ редактируется в админке без редеплоя; GET не отдаёт ключ
(ни поле `api_key`, ни значение); отображение — `has_api_key` + `key_last4`.

**Артефакты:**
- `backend/tests/test_admin_llm_api.py::test_providers_crud_and_key_masking` —
  shape item (13 ключей, `api_key` отсутствует), `key_last4 == ключ[-4:]`,
  сырое тело ответа не содержит значение ключа (POST/GET/PATCH).
- `backend/tests/test_admin_llm_api.py::test_no_secret_in_any_llm_endpoint` —
  значение ключа не встречается ни в одном GET `/api/admin/llm/*`.
- `backend/tests/test_admin_llm_api.py::test_provider_test_call` — тест-вызов
  берёт ключ из БД на бэке (`mock.call_args.kwargs["api_key"]`), в ответе ключа нет.
- Реализация: `backend/app/ai/llm_store.py::mask_provider` (единственная форма
  провайдера наружу), `backend/app/routers/admin_llm.py`.
- Frontend: `frontend/src/features/admin/pages/AdminLlmPage.test.mjs` — мок
  содержит `api_key: "sk-SECRET_SHOULD_NOT_LEAK"`; UI его не рендерит
  (assert по textContent), отображается только `•••{last4}`.

## Гейт 2. Версионирование промтов с откатом — ✅

**Требование:** новая версия → activate → gateway берёт её; rollback работает.

**Артефакты:**
- `backend/tests/test_admin_llm_api.py::test_prompts_versioning_activate_rollback` —
  draft v1/v2 → activate v2 (v1 → archive, `archived_id` в ответе) →
  rollback → активна v1 (v2 → archive); 404 на несуществующий промт,
  409 `no_rollback_target` без archived-версий, 422 на пустой feature/кривой
  model_class.
- `backend/tests/test_llm_gateway.py::test_active_prompt_used_and_versioned` —
  после activate новой версии gateway вызывает LLM с system новой версии
  (SYS1 → SYS2), `prompt_version` в результате.
- `backend/tests/test_llm_gateway.py::test_prompt_rollback_service` —
  service-уровень: `rollback_target` + `activate_prompt`.
- Реализация: `llm_store.py::{create_prompt_draft, activate_prompt,
  rollback_target}` — activate атомарно архивирует текущий active одной
  транзакцией (единый active на фичу).

## Гейт 3. Кэш = 0 токенов на повтор — ✅

**Требование:** повторный вызов с неизменным входом → cached-hit, 0 токенов,
запись `llm_usage(cached=true, tokens=0)`.

**Артефакты:**
- `backend/tests/test_llm_gateway.py::test_complete_cached_hit_zero_tokens` —
  первый вызов miss (LLM вызван 1 раз), второй hit: `cached=true`,
  `usage={prompt_tokens:0, completion_tokens:0}`, в БД строка `cached=true`
  с нулевыми токенами; текст ответа идентичен.
- `backend/tests/test_llm_gateway.py::test_complete_cached_miss_per_digest` —
  другой digest = новый вызов (LLM вызван повторно).
- `backend/tests/test_admin_llm_api.py::test_usage_aggregate_shape_and_totals` —
  cached-строки видны в агрегации (`cached_hits`) и не добавляют токенов.
- Реализация: `gateway.py::complete_cached` — ключ
  `pm:cache:llm:{feature}:v1:{digest}`, TTL 7д, Redis через
  `app/redis_cache.py` (недоступен → прозрачный miss, без падений).

## Гейт 4. Деградация без ключей — ✅

**Требование:** нет активных провайдеров → `no_provider`, фича честно
«LLM не настроен», система работает; лимит → `rate_limited` (не 500);
флаг off → `disabled`.

**Артефакты:**
- `backend/tests/test_llm_gateway.py::test_no_provider_without_keys` —
  disabled-провайдер + провайдер без ключа → `no_provider`, LLM не вызывался,
  `llm_usage(status='no_provider')`.
- `backend/tests/test_llm_gateway.py::test_env_fallback_when_table_empty` —
  env `DEEPSEEK_API_KEY` как фолбэк при полностью пустой таблице
  (`provider_id='env_fallback'`).
- `backend/tests/test_llm_gateway.py::test_feature_disabled` — флаг off →
  `disabled` без вызова.
- `backend/tests/test_llm_gateway.py::test_rate_limited` — лимит исчерпан →
  `rate_limited` с `used_tokens_24h/daily_token_limit`, без вызова, не 500.
- `backend/tests/test_llm_gateway.py::test_all_providers_failed` — вся цепочка
  упала → `error` с именем последнего провайдера (без ключа в сообщении).
- `backend/tests/test_admin_llm_api.py::test_provider_test_call` — провайдер
  без ключа: тест-вызов → `{ok:false, error:"api_key is not set"}`, не 500.

## Гейт 5. Pytest-дельта пустая + снапшоты роутов — ✅

**Требование:** backend pytest — дельта к baseline (origin/main) пустая;
новые эндпоинты — shape-снапшоты.

**Артефакты:**
- Полный сьют на ветке: `26 failed, 950 passed, 1 skipped` (815с).
  Все 26 падений — pre-existing: идентичный список из 26 FAILED на origin/main
  (прогон тех же файлов, см. PR-описание, «Baseline delta»). Новые тесты:
  18/18 (`test_llm_gateway.py` 10 + `test_admin_llm_api.py` 8).
- Shape-снапшоты: `test_admin_llm_api.py` — `PROVIDER_SHAPE` (13 ключей),
  `PROMPT_SHAPE` (10), `FEATURE_SHAPE` (6), `USAGE_ITEM_SHAPE` (8),
  `USAGE_TOTALS_SHAPE` (5); helper `_assert_shape` (точный набор ключей + типы),
  RBAC-гейты 401/403 (`test_admin_gate_401_403`).
- Frontend-сьют: admin 64/64 (baseline 56/56 → +8 новых); полный сьют —
  падения идентичны pre-existing на main (см. PR-описание).
- Регрессионный периметр не тронут: существующие LLM-фичи (ai/questions,
  path_report, notes/extraction) НЕ переписаны на gateway; mock E3.5 не тронут;
  правки в существующих файлах — только регистрация роутера
  (`routers/__init__.py` +2 строки) и additive-регистрация секции во frontend.

---

## Состав PR

**Backend:** `app/ai/llm_store.py` (CRUD/агрегации llm_*), `app/ai/gateway.py`
(`complete`/`complete_cached`, фолбэк-цепочка, лимиты, Redis-кэш),
`app/routers/admin_llm.py` (10 эндпоинтов), `routers/__init__.py` (регистрация),
`tests/test_llm_gateway.py` (10), `tests/test_admin_llm_api.py` (8).

**Frontend:** секция «LLM» (`pages/AdminLlmPage.jsx` + 4 панели в
`features/admin/llm/`), i18n ru/en (`features/admin/llm/i18n/`), API-обёртки
(`apiRoutes.js`, `apiModules/adminApi.js`, `features/admin/api/adminApi.js`),
регистрация секции (constants/nav/adminUtils/AdminApp + ru.js), тесты
`adminLlmRoute.test.mjs` + `AdminLlmPage.test.mjs`.

**НЕ входит (по плану):** миграция 012 — уже в main (#650); миграция
существующих LLM-фич на gateway — отдельным решением; реальный ключ DeepSeek —
вносится через админку после деплоя (не в репо).

## Известные ⚠️ (не блокеры, фиксируем явно)
- ⚠️ Сид `hold` в ALLOWED_OPERATION_CODES не засеян (входное условие из PLAN,
  «отдельная строка») — домен E2/каталога, в LLM0 не входит; переносится
  в backlog отдельной строкой.
- ⚠️ Экран расхода агрегирует по `org_id` запроса; супер-админский cross-org
  обзор не реализован (в спеке LLM0 не требовался).
