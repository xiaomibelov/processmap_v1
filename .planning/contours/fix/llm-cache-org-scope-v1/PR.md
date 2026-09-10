# PR — fix/llm-cache-org-scope-v1

## Что закрывает

Три связанные находки аудита `audit/llm-agent-audit-v1` (2026-09-10):

| # | Находка | Суть |
|---|---|---|
| M1 | Cross-org коллизия Redis-кэша LLM | Ключ `pm:cache:llm:{feature}:v1:{digest}` без org_id; digest projection намеренно исключает org/session → две org с одинаковой схемой делили cache-hit |
| L1 | Stale-prompt в кэше до 7 суток | Смена active-версии промпта не инвалидировала кэш (read-path не сверял prompt_version) |
| L13 | Kill-switch не работает на hit'ах | `complete_cached` отдавал кэш ДО feature-flag check → disabled-фича продолжала обслуживаться из Redis |

## Изменения

1. **Ключ кэша v2**: `pm:cache:llm:{feature}:v2:{org_id}:pv{prompt_version}:{ov}:{digest}`
   - `org_id` — изоляция org (M1);
   - `pv{prompt_version}` — версия активного промпта; активация новой версии = мгновенная инвалидация (L1);
   - `{ov}` — детерминированный маркер `prompt_override` (md5 canonical JSON, 12 символов): разные override-варианты не делят кэш;
   - v1→v2 как стратегия инвалидации: старые ключи вымирают по TTL (7 дней), массовый flush не нужен. Зависимостей от формата ключа в коде нет (`llm_cache_key` — внутренняя функция, внешних callers нет).
2. **Порядок проверок в `complete_cached`**: гейт фичи (enabled + суточный лимит) ДО cache-lookup. Disabled/rate_limited → статусная деградация с записью в `llm_usage`, кэш не читается (L13). Гейт — единая реализация `_feature_gate_violation()` для `complete()` и `complete_cached()`.
3. **Зеркалирование в agent-сервис**: `services/agent/gateway/gateway.py` (stage serving-путь) — те же изменения; docstring `redis_cache.py` и живый документ `docs/agent/REQUEST_FLOW.md` приведены к v2.

TTL (7 суток), retry-логика, provider chain, `llm_usage`-схема — без изменений. `processman_agent` чат по-прежнему не кэшируется (N4, by design).

## Тесты (TDD: RED → GREEN)

3 новых теста в `backend/tests/test_llm_gateway.py`, все падали на текущем коде:

- `test_complete_cached_no_cross_org_hit` — две org, один digest → нет cross-org hit, 2 разных ключа v2;
- `test_complete_cached_prompt_version_invalidates` — активация v2 промпта → miss; новая версия кэшируется отдельно;
- `test_complete_cached_disabled_after_fill` — фича выключена после наполнения кэша → `status=disabled`, 0 обслуживания из кэша.

Гейт LLM0 «кэш = 0 токенов» сохранён: `test_complete_cached_hit_zero_tokens` зелёный без правки (cached=true, usage={0,0}, llm_usage cached=true, tokens=0).

Регрессия: полный прогон `backend/tests` — дельта против baseline `origin/main` = 0 новых падений (детали в `.planning/contours/fix/llm-cache-org-scope-v1/TESTS.md`).

## Риски

- После деплоя первые вызовы каждой фичи/org = miss до заполнения v2-кэша (ожидаемо, hit-rate восстанавливается за TTL-цикл).
- LLM_VIA_AGENT_SVC=1: монолит и agent-сервис используют один Redis; обе реализации переведены на v2 одновременно — рассинхрона формата ключей не будет.

merge/deploy — по approve владельца.
