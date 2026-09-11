# CHANGES — fix/llm-cache-org-scope-v1

Контур закрывает три связанные находки аудита `audit/llm-agent-audit-v1` (2026-09-10):
**M1** (cross-org коллизия Redis-кэша), **L1** (stale-prompt до 7 суток), **L13** (kill-switch не работает на cache-hit).

Baseline: `origin/main @ 3defec225deeda25789824cee2119d01d7c88cf0`.
Worktree: `processmap_v1_main_clone-worktrees/fix-llm-cache-org-scope-v1`.

## Изменения

### 1. Ключ кэша v2: org-scope + prompt-version-scope (M1, L1)

`backend/app/ai/gateway.py`, зеркально `backend/services/agent/gateway/gateway.py`:

- Было: `pm:cache:llm:{feature}:v1:{digest}` — без org_id, digest projection
  намеренно исключает org/session (`process_projection.py:149-156`) → две org
  с одинаковой схемой делили cache-hit.
- Стало: `pm:cache:llm:{feature}:v2:{org_id}:pv{prompt_version}:{ov}:{digest}`.
  - `org_id` — изоляция org (M1).
  - `pv{prompt_version}` — версия активного промпта из `_resolve_prompt` (L1):
    активация новой версии = новый ключ = мгновенная инвалидация, не через TTL.
  - `{ov}` — детерминированный маркер `prompt_override` (md5 canonical JSON,
    12 символов; `ov0` при отсутствии) — разные override-варианты не делят кэш.
- TTL (7 суток) и общий паттерн кэширования не менялись. Стратегия инвалидации
  v1→v2: старые v1-ключи вымирают по TTL, массовый flush не нужен.
  Зависимостей от формата ключа в коде нет: `llm_cache_key` — внутренняя
  функция gateway, внешних callers нет; ключ не парсится нигде (grep
  `pm:cache:llm` — только документация). Живый документ
  `docs/agent/REQUEST_FLOW.md` обновлён; исторические планы/верификации
  (AGENT1_PLAN, AGENT_SVC_PLAN, PHASE5_VERIFICATION) — точечные записи,
  не тронуты.

### 2. Порядок проверок в complete_cached: гейт ДО cache-lookup (L13)

- Было: cache-lookup → flag-check в `complete()` только на miss → disabled-фича
  продолжала обслуживаться из кэша.
- Стало: `_feature_gate_violation(feature, org_id)` (enabled + суточный лимит)
  вызывается в `complete_cached` ДО cache-lookup; нарушение → статус
  `disabled`/`rate_limited` с записью в `llm_usage` (cached=false), кэш не
  читается. Гейт — единая реализация для `complete()` и `complete_cached()`
  (дедупликация логики, правило единой реализации AGENTS.md).

### 3. Зеркалирование в agent-сервис

`services/agent/gateway/gateway.py` — byte-level копия монолитного gateway
(stage serving-путь по nginx default.conf) — изменения 1–2 зеркалированы
полностью. Docstring `services/agent/gateway/redis_cache.py` (описание формата
ключа) обновлён.

### Вне скоупа (не тронуто)

- processman_agent chat не кэшируется by design (N4) — без изменений.
- TTL, retry, provider chain, llm_usage-схема — без изменений.
- `digest` projection по-прежнему без org/session — изоляция обеспечивается
  ключом, семантика digest не менялась (минимальный патч).

## Контрактные гарантии после фикса

- Cache hit → `cached=true`, `usage={0,0}` (гейт LLM0 «кэш = 0 токенов»)
  сохранён; тест `test_complete_cached_hit_zero_tokens` зелёный без правки.
- Cross-org: идентичная схема + одинаковый вопрос у двух org → 0 cross-org hit.
- Смена active-версии промпта → следующий вызов = miss (старый кэш не отдаётся).
- Disabled-фича после наполнения кэша → `status=disabled`, 0 обслуживания.
