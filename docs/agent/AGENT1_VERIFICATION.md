# AGENT-1 — Verification Protocol

> Branch: `docs/agent-1-verification`  
> Base: `origin/main @ da5b899c` (PR-1/PR-2/PR-3 merged)  
> HEAD: `a591abd7` + docs update  
> Date: 2026-08-18  
> Runtime: local docker compose, isolated ports (`.env.agent1verify`)  
> Verifier: Kimi CLI

## Preconditions

| Item | Value | Artifact |
|------|-------|----------|
| Local stack | `docker compose --env-file .env.agent1verify up -d --build api frontend agent notifications postgres redis` | 6 services healthy |
| API health | `GET http://localhost:8012/health` | `alembic_version: 022`, status `degraded` (migrations head mismatch is expected local noise) |
| LLM provider | VVPROXY `https://vvchat.vkusvill.ru/red-mad-router` | `GET /api/llm/status → configured:true` |
| `LLM_VIA_AGENT_SVC` | `1` | `docker compose exec api env` |
| Test org/session | org `org_default`, project `c535d2b08a`, session `02315c2eac` (1 step: `n_9a469bbb Prepare order`) | `GET /api/sessions/02315c2eac/agent/projection` |

Agent endpoints (`/api/sessions/{id}/agent/chat|history|stream`) проксируются через nginx, поэтому e2e-вызовы идут на порт фронтенда `5178`, admin/DB-чеки — на API-порт `8012`.

## State after prompt activation

Активированы через `POST /api/admin/llm/prompts/{id}/activate`:

| Feature | Active prompt | Version | Status of previous version |
|---------|---------------|---------|----------------------------|
| `agent_router` | `llmprompt_agent_router_v1` | 1 | `llmprompt_c5886a15a938` (v2) → `archive` |
| `agent_memory` | `llmprompt_agent_memory_v1` | 1 | — (already active) |
| `processman_agent` | `llmprompt_processman_agent_v2` | 2 | `llmprompt_processman_agent_v1` → `archive` |

Feature-model override:

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H 'X-Org-Id: org_default' \
  http://localhost:8012/api/admin/llm/feature-models
```

```json
{
  "feature": "processman_agent",
  "model_id": "llmmodel_90d8f66c6a87",
  "model_name": "claude-opus-4-6"
}
```

Provider (masked):

```json
{
  "name": "VVPROXY",
  "base_url": "https://vvchat.vkusvill.ru/red-mad-router",
  "model": "claude-opus-4-6",
  "enabled": true,
  "has_api_key": true,
  "key_last4": "0OhQ"
}
```

## Router tuning

Тюнинг проводился с активным `agent_router v1`. Классификацию смотрели напрямую через внутренний endpoint сервиса (`POST /internal/llm/complete_cached`), чтобы отделить intent роутера от последующих веток и action-JSON `processman_agent`.

```python
payload = {
    "input": json.dumps({
        "question": q,
        "projection_digest": "04885cc34de1fc206dc1d0fc91a1644d",
        "selected_node_id": step_id or "",
        "history_summary": ""
    })
}
```

| # | Question | `selected_node_id` | Expected | Actual raw intent | Verdict |
|---|----------|--------------------|----------|-------------------|---------|
| 1 | что делает шаг Prepare order? | `n_9a469bbb` | `node_qa` | `node_qa` | OK |
| 2 | расскажи про схему целиком | — | `schema_overview` | `schema_overview` | OK |
| 3 | что дальше? | `n_9a469bbb` | `suggest_next` | `suggest_next` | OK |
| 4 | какие нормативы регулируют эту операцию? | — | `doc_qa` | `doc_qa` | OK |
| 5 | привет, как дела? | — | `smalltalk` | `smalltalk` | OK |
| 6 | объясни шаг Prepare order | `n_9a469bbb` | `node_qa` | `node_qa` | OK |
| 7 | опиши процесс | — | `schema_overview` | `schema_overview` | OK |
| 8 | где описан процесс приготовления? | — | `doc_qa` | `schema_overview` | FAIL |
| 9 | какой следующий блок добавить? | `n_9a469bbb` | `suggest_next` | `suggest_next` | OK |
| 10 | кто ты? | — | `smalltalk` | `smalltalk` | OK |

**Accuracy: 9/10**. Один реальный промах (вопрос #8 отнесён к `schema_overview`, хотя по смыслу — `doc_qa`). Это в пределах порога «≤2 мисклассификации», поэтому **итераций промпта не потребовалось**.

## Gate K1–K3

### K1 — node_qa

```bash
curl -s -X POST "http://localhost:5178/api/sessions/02315c2eac/agent/chat" \
  -H "Authorization: Bearer $TOKEN" -H 'X-Org-Id: org_default' \
  -H 'Content-Type: application/json' \
  -d '{"message":"что делает шаг Prepare order?","selected_step_id":"n_9a469bbb","client_turn_id":"k1_001"}'
```

Response:

```json
{
  "ok": true,
  "status": "ok",
  "action": "step-qa",
  "action_payload": {
    "step_id": "n_9a469bbb",
    "answer": "Шаг Prepare order (Подготовка заказа) — это шаг процесса...",
    "cached": true
  }
}
```

`llm_usage` для этого вызова:

```sql
SELECT feature, prompt_tokens, completion_tokens, cached, model, ts
FROM llm_usage
WHERE session_id='02315c2eac' AND feature='agent_router'
ORDER BY ts DESC LIMIT 1;
```

```text
agent_router | 334 | 3 | f | deepseek-chat | 1787001115
```

**Verdict: PASS**. Router отработал не из кэша (`cached=false`), финальная ветка — `step-qa`, ответ осмысленный.

### K2 — schema_overview

Перед холодным вызовом удалили строку памяти:

```sql
DELETE FROM agent_schema_memory WHERE session_id='02315c2eac';
```

Холодный вызов:

```bash
curl -s -X POST "http://localhost:5178/api/sessions/02315c2eac/agent/chat" ... \
  -d '{"message":"расскажи про схему целиком","client_turn_id":"k2_cold_001"}'
```

Result:

- Wall time: **9.96 s**
- `action: "schema_overview"`
- `usage.cached: false`
- `usage.model: "claude-opus-4-6"`, `usage.prompt_version: 2`

После вызова worker записал память:

```sql
SELECT session_id, summary, projection_digest FROM agent_schema_memory
WHERE session_id = '02315c2eac';
```

```text
02315c2eac | Схема содержит один шаг 'Prepare order' без указания длительности и роли. Связи между шагами отсутствуют, что указывает на начальную стадию моделирования процесса. | 04885cc34de1fc206dc1d0fc91a1644d
```

Тёплый вызов (тот же вопрос):

- Wall time: **1.34 s**
- `usage.cached: true`
- Новых строк в `llm_usage` для `processman_agent` и `agent_memory` **не появилось**.

**Verdict: PASS** (≤5 с при тёплой памяти, 0 LLM-токенов на повтор).

### K3 — router cache on repeat question

Fix: `fix/agent-1-router-cache` — `route_intent` теперь вызывает `complete_cached(ROUTER_FEATURE, cache_digest=...)`, где `cache_digest = _router_digest(question, projection_digest, selected_node_id)`.

Проверка на свежем локальном стеке (session `645cee3ad1`, пустая схема):

```bash
# first
curl -s -X POST "http://localhost:5178/api/sessions/645cee3ad1/agent/chat" \
  -H "Authorization: Bearer $TOKEN" -H 'X-Org-Id: org_default' \
  -H 'Content-Type: application/json' \
  -d '{"message":"расскажи про схему","client_turn_id":"k3_first"}'
# second (same text + same projection)
curl ... -d '{"message":"расскажи про схему","client_turn_id":"k3_second"}'
```

`llm_usage` за оба вызова:

```sql
SELECT feature, prompt_tokens, completion_tokens, cached, model, ts
FROM llm_usage
WHERE session_id='645cee3ad1' AND feature='agent_router'
ORDER BY ts;
```

```text
agent_router | 240 | 3 | f | deepseek-chat | 1787002047
agent_router |   0 | 0 | t | deepseek-chat | 1787002053
```

Redis:

```bash
docker compose exec -T redis redis-cli -n 0 KEYS 'pm:cache:llm:agent_router:*'
# pm:cache:llm:agent_router:v1:947b2948bc35605f71926c02bbe87de1

docker compose exec -T redis redis-cli -n 0 TTL 'pm:cache:llm:agent_router:v1:947b2948bc35605f71926c02bbe87de1'
# 604769
```

**Verdict: PASS**. Первый вызов роутера — `cached=false`, второй — `cached=true`, 0 токенов, ключ в Redis с TTL ~7 дней.

## Spot-check: empty schema

Session `367ff665c6` — пустая схема (0 шагов).

```bash
curl -s -X POST "http://localhost:5178/api/sessions/367ff665c6/agent/chat" ... \
  -d '{"message":"что это?","client_turn_id":"empty_001"}'
```

Response excerpt:

```json
{
  "ok": true,
  "status": "ok",
  "message": "Это пустая BPMN-схема кухонного процесса...",
  "action": null,
  "action_payload": {}
}
```

Сырой JSON не показан.

## Примечание о `list_turns(session_id, "", org_id)` в memory-воркере

В `backend/services/agent/memory/schema_memory.py:238` worker вызывает:

```python
turns = list_turns(sid, "", oid, limit=MAX_TURNS)
```

`list_turns` строит `conversation_id = f"conv:{session_id}:{user_id}"`. С `user_id=""` получается ключ `conv:{session_id}:`, то есть **session-level** диалог, а не per-user. Это корректно для `agent_schema_memory`, потому что summary и facts привязаны к сессии (`UNIQUE(org_id, session_id)`), и для формирования общей картины схемы важна вся история сессии, а не конкретного пользователя.

## Проверка кэша в schema_overview / smalltalk

По плану (таблица 2.6) кэш LLM в этих ветках не предусмотрен:

- `schema_overview`: тёплый ответ берётся из `agent_schema_memory` (0 LLM-токенов), холодный — один вызов `processman_agent` + фоновый `schedule_memory_update`.
- `smalltalk`: один вызов `processman_agent` с коротким ответом.

В коде `backend/services/agent/memory/chat.py` обе ветки используют `complete(FEATURE, ...)`, что соответствует плану. Дополнительного кэширования, аналогичного router, там не требуется.

## Token economy

```sql
SELECT feature, sum(prompt_tokens), sum(completion_tokens)
FROM llm_usage
WHERE session_id='02315c2eac'
GROUP BY feature;
```

```text
agent_memory     |  3348 | 1187
agent_router     | 21814 | 2940
processman_agent | 72917 | 5083
schema_assistant |  2938 |  584
```

Большая часть `processman_agent` — это тюнинговые прогоны (smalltalk/doc_qa/schema_overview) и холодный schema_overview. В production-режиме расход будет значительно ниже за счёт кэша LLM3 и тёплой памяти схемы.

## Overall Verdict

| Criterion | Verdict | Note |
|-----------|---------|------|
| Router tuning accuracy | PASS | 9/10, в пределах допуска |
| K1 node_qa | PASS | router uncached, step-qa, meaningful answer |
| K2 schema_overview | PASS | cold → memory row, warm ≤5 s / 0 tokens |
| K3 router cache | **PASS** | после фикса `fix/agent-1-router-cache`: второй вызов `cached=true`, 0 токенов |
| Empty schema smalltalk | PASS | no raw JSON |

**Рекомендация:** AGENT-1 gate K1–K3 закрыт. Следующий шаг — review и merge PR `fix/agent-1-router-cache`, затем мониторинг soak (монолитный agent-код и флаг `LLM_VIA_AGENT_SVC` не трогать).

## Git Proof

```bash
git branch --show-current   # docs/agent-1-verification
git rev-parse HEAD          # a591abd7...
git status --short          # docs/agent/AGENT1_VERIFICATION.md
```
