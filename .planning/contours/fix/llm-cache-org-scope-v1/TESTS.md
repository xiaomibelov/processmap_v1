# TESTS — fix/llm-cache-org-scope-v1

Дата: 2026-09-10. Окружение: dev-БД `postgresql://fpc:fpc@localhost:5432/processmap`,
venv `processmap_v1_main_clone/.venv`, Python 3.11.

## RED (на текущем коде, до фикса)

3 новых теста `backend/tests/test_llm_gateway.py`, все падают по правильной причине:

| Тест | Находка | Причина падения на старом коде |
|---|---|---|
| `test_complete_cached_no_cross_org_hit` | M1 | org2 получает `cached=True` по ключу org1 (общий v1-ключ без org_id) |
| `test_complete_cached_prompt_version_invalidates` | L1 | после активации prompt v2 вызов даёт `cached=True` (stale-кэш) вместо miss |
| `test_complete_cached_disabled_after_fill` | L13 | disabled-фича отдаётся из кэша (`ok=True, cached=True`) вместо `status=disabled` |

Прогон: `-k "no_cross_org or prompt_version_invalidates or disabled_after_fill"` → 3 failed.
Соседние гейты (`hit_zero_tokens`, `miss_per_digest`) в том же прогоне — зелёные.

## GREEN (после фикса)

`backend/tests/test_llm_gateway.py` — полный файл: **23 passed, 1 failed**;
единственное падение — `test_effective_providers_with_key_prefers_org_then_org_default`,
подтверждённый **pre-existing env-дефект**: упавший тест оставляет провайдера
`default-p` в `org_default` shared dev-БД, а в этой БД живёт включённый провайдер
`deepseek` (org_default, has_key) → assert на единственного провайдера ломается.
Доказательство: тот же тест падает на чистом `origin/main` (scratch-worktree
`/tmp/baseline-llm-cache-check`) с идентичной ошибкой. Контур к коду теста
не прикасался. Локальный shared DB также очищен от артефактов прогонов
(`DELETE default-p`-остатков).

Все 3 новых теста — PASSED. Гейты LLM0 зелёные:
- `test_complete_cached_hit_zero_tokens` — **без правки**: hit → `cached=true`,
  `usage={0,0}`, `llm_usage` row `cached=true, tokens=0` (контракт «кэш = 0 токенов»
  сохранён на v2-ключах);
- `test_fallback_true_for_env_provider` — fallback-бейдж сохраняется в кэше.

Agent-сервис (зеркало gateway):
`backend/services/agent/tests/test_gateway.py test_internal_llm.py test_intent_router.py test_gateway_cost_logging.py`
→ **22 passed**. Контракт `/internal/llm/complete_cached` (field-by-field + digest
reach-through) не сломан.

## Полная регрессия backend/tests

Полный прогон `backend/tests` (без `tests/contract`), `-p no:randomly --timeout=120`,
детерминированный порядок:

| | baseline `origin/main @ 3defec22` | ветка `fix/llm-cache-org-scope-v1` |
|---|---|---|
| passed | 1438 | **1441** (+3 — новые тесты) |
| failed | 53 | 53 |
| skipped | 103 | 103 |
| время | 65:09 | 66:57 |

**Дельта множеств падений: пустая в обе стороны** (53 = 53, `comm` обе диагонали
пустые). Новых падений нет. Сводный характер 53 env-падений (вне контура):
`embedder unavailable` (rag_api/rag_hybrid — embedder недоступен на локальном
стеке, контекстно-зависимые), sqlite `cost_usd`-schema drift (admin_agent_runs),
redis-lock/RBAC/dead-session/deepseek-retry — общие для обеих веток.

Сравнение корректно: оба прогона — полные suite'ы в идентичном детерминированном
порядке против одной и той же shared dev-БД; pairwise-прогон 53 упавших на baseline
(50/53 совпали, 3 rag_hybrid прошли изолированно) уточнён полным baseline-suite'ом —
в полном контексте baseline эти 3 падают так же.

## Итог

- RED→GREEN по 3 тестам: подтверждён.
- Гейт LLM0 (кэш = 0 токенов, деградация): зелёный на новой v2-схеме.
- Регрессия backend/tests: 0 новых падений.
