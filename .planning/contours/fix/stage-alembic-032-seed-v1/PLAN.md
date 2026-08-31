# Контур: fix/stage-alembic-032-seed-v1

## Цель
Закрыть цепочку дефектов аудита `stage-verify-agent-wave-a-v1` (F1, F4, F7):
на stage `llm_models` пуст из-за неидемпотентного seed в миграции 032 →
отсутствует pricing → `cost_usd` не заполняется → `resolve_model_for_feature`
падает в conservative fallback `primary` (claude-opus-4-6) вместо `cheap`
(deepseek-chat). Экономия T5 (60.7%) не работает.

## В scope
1. Сделать миграцию `032_agent_model_class_and_cost.py` idempotent:
   - upsert deepseek-chat (`cheap`, ненулевые цены);
   - upsert/включить deepseek seed-провайдер, если у него уже есть ключ;
   - оставить insert primary default (claude-opus-4-6).
2. Исправить `/api/health` mismatch: `ALEMBIC_HEAD = "032"`.
3. Пробросить `cost_usd` в `AgentChatOut.usage` (agent service `memory/chat.py`).
4. Добавить `cost_usd` в агрегацию `/api/admin/llm/usage` (`app/ai/llm_store.py`).
5. Обновить тесты ожиданий: `test_migration_bootstrap_resilience.py`,
   `test_admin_llm_api.py`.

## Out of scope
- Логика `resolve_model*` не меняется.
- Переключение `LLM_VIA_AGENT_SVC`, nginx, frontend.
- Ручное применение миграции на stage-БД — это ops-шаг после merge.

## Критерии приёмки
- `db_bootstrap` на baseline 009 доводит БД до head `032`.
- После 032 в `llm_models` есть `llmmodel_deepseek_chat` (cheap, цены) и
  `llmmodel_opus_4_6_primary` (primary default).
- `AgentChatOut.usage` содержит ненулевой `cost_usd` при известных ценах.
- `/api/admin/llm/usage` возвращает `cost_usd` в item и totals.
- Агентские тесты и тест миграций проходят.
