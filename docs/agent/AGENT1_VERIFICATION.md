# AGENT-1 — Verification Protocol

> Branch: `docs/agent-1-verification`  
> Base: `origin/main @ da5b899c` (PR-1/PR-2/PR-3 merged)  
> Date: 2026-08-17  
> Runtime: local docker compose, isolated ports (`.env.agent1verify`)  
> Verifier: Kimi CLI

## Preconditions

| Item | Value | Artifact |
|------|-------|----------|
| Local stack | `docker compose --env-file .env.agent1verify up -d --build api frontend agent notifications postgres redis` | 4 services healthy |
| API health | `GET http://localhost:8012/health` | `alembic_version: 022` |
| LLM provider | VVPROXY `https://vvchat.vkusvill.ru/red-mad-router` | `GET /api/llm/status → configured:true` |
| `LLM_VIA_AGENT_SVC` | `1` | `docker compose exec api env` |
| Test org/session | org `org_default`, project `c535d2b08a`, session `02315c2eac` (1 step: `n_9a469bbb Prepare order`) | `GET /api/sessions/02315c2eac/agent/projection` |

**Note on ports:** agent endpoints (`/api/sessions/{id}/agent/chat|history|stream`) are routed by nginx, so e2e calls below use the **frontend port** (`5178`), while admin/DB checks use the API port (`8012`).

## Gate Checklist

| ID | Criterion | Verdict | Evidence |
|----|-----------|---------|----------|
| K1 | Свободный вопрос про узел → `node_qa` с чипами | **PARTIAL** | `POST /api/sessions/02315c2eac/agent/chat` → `action: "step-qa"`, `step_id: "n_9a469bbb"`, HTTP 200, meaningful answer. Router intent was classified as `node_qa` (see `llm_usage.feature=agent_router`), but the final action label is `step-qa` because the branch delegates to the monolith LLM3 runner. |
| K2 | «расскажи про схему» ≤ 5 с при тёплой памяти | **FAIL** | Same endpoint returned `action: "step-qa"` in 7.47 s. `schema_overview` intent was not selected by the cheap router with the current draft prompts; no warm-memory path was exercised. |
| K3 | Router cached → 0 tokens on repeat question | **FAIL** | Second identical question consumed `prompt_tokens: 1153, completion_tokens: 36, cached: false`. `complete_cached` did not hit for the router/feature path in this run. |
| K4 | `agent_schema_memory` persists across dialog | **PASS** | After the dialog a row exists: `summary='Схема содержит один шаг процесса — подготовку заказа.'`, `facts_json` non-empty, `projection_digest='04885cc34de1fc206dc1d0fc91a1644d'`. |
| K5 | SSE streams tokens, ends with `done`, abort works | **PASS** | `POST /api/sessions/02315c2eac/agent/stream` produced 44 events: `start → token* → done`. Abort via `AbortController` verified at client level (fetch reader closed). |
| K6 | `pytest backend/services/agent/tests` green | **PASS** | `51 passed, 97 warnings` |
| K7 | `pytest backend/tests -m contract` green | **PASS** | `145 passed, 1183 deselected, 21 warnings` |
| K8 | Disabled provider → `status: "no_provider"`, HTTP 200 | **PASS** | `PATCH /api/admin/llm/providers/{id} {enabled:false}` → chat returned `{"ok":false,"status":"no_provider","error":"no enabled LLM providers with api key"}` with HTTP 200. Re-enabled afterwards. |
| K9 | Empty schema → human-readable text, no raw JSON | **PASS** | Empty session `367ff665c6`, question «что это?» → `message: "Это пустая BPMN-схема (0 узлов, 0 связей)."`, `action: null`. |
| K10 | 0 LLM calls on open/history/step selection | **PASS** | `GET /api/sessions/02315c2eac/agent/history` returned turns with no new `llm_usage` rows for `feature='processman_agent'`. |

## Observations

1. **Router classification accuracy is low with draft prompts.** Both `node_qa` and `schema_overview` test questions were routed into the LLM3 `step-qa` runner path. This is expected while `processman_agent_v2` and the router/memory prompts remain `draft` (owner activation pending after tuning).
2. **Schema-memory background worker is functional.** Once a turn reaches a branch that calls `schedule_memory_update`, the in-process worker consumes the Redis queue and writes to `agent_schema_memory`.
3. **Redis queue sanity note.** During the run, `lpush` on `pm:agent:memory:queue` occasionally appeared empty immediately because the background worker pops jobs quickly; this is normal behavior, not data loss.

## Artifacts

### K1 — node_qa / step-qa

```bash
curl -s -X POST "http://localhost:5178/api/sessions/02315c2eac/agent/chat" \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: org_default" \
  -H 'Content-Type: application/json' \
  -d '{"message":"что делает шаг Prepare order?"}'
```

Response excerpt:

```json
{
  "ok": true,
  "status": "ok",
  "action": "step-qa",
  "action_payload": {
    "step_id": "n_9a469bbb",
    "answer": "Шаг Prepare order ...",
    "usage": {"prompt_tokens": 328, "completion_tokens": 82}
  },
  "usage": {"prompt_tokens": 1083, "completion_tokens": 36, "cached": false}
}
```

### K2 — schema_overview attempt

```json
{
  "ok": true,
  "status": "ok",
  "action": "step-qa",
  "message": "Данных о схеме недостаточно: нет соседей, длительности, роли и других шагов.",
  "usage": {"prompt_tokens": 1117, "completion_tokens": 35}
}
```

### K4 — schema memory row

```sql
SELECT session_id, summary, facts_json, projection_digest
FROM agent_schema_memory
WHERE session_id = '02315c2eac';
```

```text
02315c2eac | Схема содержит один шаг процесса — подготовку заказа. | ["В схеме присутствует единственный шаг с идентификатором n_9a469bbb.", "Название шага — 'Prepare order'.", "Других элементов (событий, шлюзов, потоков) в схеме не описано."] | 04885cc34de1fc206dc1d0fc91a1644d
```

### K5 — SSE event trace (first/last)

```text
event: start
data: {"turn_id": "turn_..."}

event: token
data: {"delta": "При"}
...
event: done
data: {"usage": {...}}
```

### K6 — agent service tests

```bash
cd backend
pytest services/agent/tests/ -q
# 51 passed, 97 warnings in 1.65s
```

### K7 — backend contract tests

```bash
pytest tests/ -m contract -q
# 145 passed, 1183 deselected, 21 warnings in 579.61s
```

### K8 — disabled provider

```bash
curl -s -X PATCH "http://localhost:8012/api/admin/llm/providers/llmprov_af9c8dc085be" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"enabled":false}'
```

Chat response:

```json
{"ok": false, "status": "no_provider", "error": "no enabled LLM providers with api key"}
```

HTTP status: 200.

### K9 — empty schema

```json
{
  "ok": true,
  "message": "Это пустая BPMN-схема (0 узлов, 0 связей). Вероятно, она ещё не заполнена или не загружена.",
  "action": null,
  "action_payload": {}
}
```

## Overall Verdict

- **PASS:** K4, K5, K6, K7, K8, K9, K10
- **PARTIAL:** K1 (functional answer about the node, but action label is `step-qa`, not `node_qa`)
- **FAIL:** K2, K3 (router/intent classification and caching need tuning with the live key before owner activation)

**Recommendation:** do **not** consider AGENT-1 fully verified until the owner activates the draft prompts (`processman_agent_v2`, `agent_router`, `agent_memory`) and re-runs K1–K3. No production deploy without that re-run.

## Git Proof

```bash
git branch --show-current   # docs/agent-1-verification
git rev-parse HEAD          # da5b899c...
git status --short          # only docs/agent/AGENT1_VERIFICATION.md added
```
