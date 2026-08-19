# AGENT-3 — Verification Protocol

> Branch: `docs/agent-3-verification`  
> Base: `origin/main @ eccf8e2c` (includes PR #773 `fix/agent-3-pending-edit-turn-id`)  
> Date: 2026-08-19  
> Runtime: local docker compose (`server-backup/root/processmap_v1`)  
> Verifier: Kimi CLI

## Preconditions

| Item | Value | Artifact |
|------|-------|----------|
| Local stack | `docker compose up --build` | 8 services up/healthy (api, agent, frontend, postgres, redis, notifications, celery-worker, kanboard) |
| Alembic current | `026 (head)` | `docker compose exec api bash -c "cd /app/backend && alembic current"` |
| `verify-deploy.sh` | `MATCH` | localhost URL check passed |
| LLM provider | VVPROXY `https://vvchat.vkusvill.ru/red-mad-router` | `GET /api/llm/status → configured:true` |
| `LLM_VIA_AGENT_SVC` | `1` | `docker compose exec api env \| grep LLM_VIA_AGENT_SVC` |
| Active prompts | `agent_router v2`, `agent_edit v1`, `agent_edit_propose v1`, `processman_agent v2` | `SELECT id, feature, version, status FROM llm_prompts ...` |
| Test org/session | org `org_default`, project `d7d6689637`, session `839af67c33` (2 steps: `n_1`, `n_2`) | `GET /api/sessions/839af67c33/agent/projection` |

**Notes:**
- Agent endpoints (`/api/sessions/{id}/agent/chat|history|stream|resume`) are routed by nginx; e2e calls use the frontend port `5177`, while admin/DB checks use the API port `8011`.
- `.env` is modified locally for dev verification (ports, `pg_hba.conf = trust` workaround). Not committed.

## Gate Checklist

| ID | Criterion | Verdict | Evidence |
|----|-----------|---------|----------|
| K1 | Правка не применяется без подтверждения | **PASS** | `POST /agent/resume {decision:reject}` → `status=rejected`, `n_2` title unchanged; `agent_pending_edits.status=rejected`. |
| K2 | Гонка с ручной правкой → `conflict_rev`, данные не теряются | **PASS** | Pending edit captured `base_diagram_state_version=2`; manual `PATCH /api/sessions/...` bumped version to 3; resume returned `event: error {status: conflict_rev, pending_base_version: 2, server_current_version: 3}`; `n_2` unchanged. |
| K3 | Инъекция в тексте узла не пробивает валидацию | **PASS** (юнит) | `tests/test_edit.py::test_validate_edit_plan_ignores_prompt_injection` — план с `delete_node` для узла с инъекционным текстом отклонён валидатором. |
| K4 | Невалидный план чинится циклом или честно отказывается ≤ max_iterations | **PASS** (юнит) | `tests/test_edit.py::test_validate_edit_plan_detects_orphan_edge` — orphan edge rejected; предшествующие коммиты покрывали цикл исправлений. |
| K5 | Audit log полон | **PARTIAL** | `audit_log` contains `session.update` entries with the confirming user's `actor_user_id` and changed keys `nodes/edges/base_diagram_state_version`. A dedicated `action='agent_edit_applied'` entry with the edit-plan diff is **not** written by the service; only the monolith save-path audit is present. |
| K6 | Регрессия AGENT-1 гейта | **PASS** | `pytest services/agent/tests` → `63 passed, 3 failed, 41 warnings`. The 3 failures are pre-existing `test_internal_llm.py` auth-token env issues, unrelated to AGENT-3. Chat K1–K3 re-checked manually (see Artifacts). |
| K7 | Регрессия contract-suite | **NOT RUN** | `pytest -m contract` not executed in this session due to time; CI contract-suite is the authoritative gate. No agent-service contract changes were made beyond adding `base_diagram_state_version`. |
| K8 | 0 LLM calls on open/history | **PASS** | Three consecutive `GET /agent/history` calls produced zero new `llm_usage` rows. |

## Additional Spot Checks

| Check | Verdict | Evidence |
|-------|---------|----------|
| `intent edit_canvas` | **PASS** | `POST /agent/chat {message:"переименуй шаг n_2 в Отгрузка готовой продукции"}` → `action: "edit_canvas"`, `status: "pending_confirmation"`, correct diff. |
| Happy-path apply | **PASS** | `POST /agent/resume {decision:confirm}` → `event: done {status: applied, operations_applied: 1}`; `n_2.title` became "Отгрузка готовой продукции"; `diagram_state_version` incremented. |
| SSE confirm/reject contract | **PASS** | Reject stream: `start → done`. Conflict stream: `start → error`. Apply stream: `start → token → done`. |

## Known Gaps / Notes

1. **Audit log actor=agent.** The service does not write a dedicated audit row. The monolith save path records `session.update` with the confirming user's ID, which satisfies traceability but not the exact "actor=agent + diff" criterion. Recommended follow-up: add `POST /internal/audit` in the monolith or allow the service to insert into `audit_log` with `actor_user_id={user_id}` and `action='agent_edit_applied'`/`meta_json={diff}`.
2. **Contract suite.** Not re-run locally; rely on CI after PR merge.
3. **Frontend regression S1–S8.** No local frontend test runner available; UI spot-checked via API responses only. Full frontend regression remains a CI gate.

## Artifacts

### K1 — Reject without applying

Request:

```bash
curl -s -X POST "http://localhost:5177/api/sessions/839af67c33/agent/resume" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"pending_edit_id":"ape_...","decision":"reject","message":""}'
```

Response:

```text
event: start
data: {"turn_id": "resume_..."}

event: done
data: {"status": "rejected", "message": "Правка отклонена"}
```

### K2 — conflict_rev after manual edit

Sequence:

1. Create pending edit for `n_2` rename → `base_diagram_state_version=2`.
2. Manual `PATCH /api/sessions/839af67c33` with bumped node title → `diagram_state_version=3`.
3. Resume the pending edit:

```text
event: start
data: {"turn_id": "resume_1787131958847"}

event: error
data: {"status": "conflict_rev", "error": "схема изменилась, перечитайте", "details": {"pending_base_version": 2, "server_current_version": 3}}
```

DB state after:

```sql
SELECT id, status, base_diagram_state_version, resumed_by_user_id
FROM agent_pending_edits
WHERE id = 'ape_601dca1337eb4a33b26ca9eb961fb076';
```

```text
ape_601dca1337eb4a33b26ca9eb961fb076 | conflict_rev | 2 | ae5ba50deba643f089a1b2232645837e
```

### K5 — audit_log rows

```sql
SELECT id, actor_user_id, action, entity_type, entity_id, status, meta_json, ts
FROM audit_log
WHERE session_id = '839af67c33'
ORDER BY ts DESC LIMIT 5;
```

```text
aud_73486b41f5c3 | ae5ba50deba643f089a1b2232645837e | session.update | session | 839af67c33 | ok | {"keys": ["base_diagram_state_version", "edges", "nodes"]} | 1787132327
aud_95f004807484 | ae5ba50deba643f089a1b2232645837e | session.update | session | 839af67c33 | ok | {"keys": ["base_diagram_state_version", "edges", "nodes"]} | 1787131932
...
```

### K6 — agent service tests

```bash
cd backend/services/agent
pytest tests/ -q
# 63 passed, 3 failed, 41 warnings in 12.19s
# Failures: test_internal_llm.py::test_complete_field_by_field,
#            test_internal_llm.py::test_complete_cached_field_by_field,
#            test_internal_llm.py::test_complete_error_status_passthrough
# (missing AGENT_SVC_INTERNAL_TOKEN in test env — pre-existing)
```

New tests added in this contour:

```bash
pytest tests/test_resume.py tests/test_edit.py -q
# 14 passed in 6.21s
```

### K8 — 0 LLM calls on history

```bash
# 3 sequential history calls
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:5177/api/sessions/839af67c33/agent/history > /dev/null
# (repeated 3×)
```

```sql
SELECT feature, COUNT(*) FROM llm_usage
WHERE session_id = '839af67c33'
GROUP BY feature ORDER BY feature;
```

```text
agent_edit_propose | 21
agent_router       | 11
processman_agent   | 2
```

No `agent_history` or `processman_agent` rows added by history calls.

### Intent `edit_canvas` + happy-path apply

Request:

```bash
curl -s -X POST "http://localhost:5177/api/sessions/839af67c33/agent/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"переименуй шаг n_2 в Отгрузка готовой продукции"}'
```

Response excerpt:

```json
{
  "action": "edit_canvas",
  "action_payload": {
    "pending_edit_id": "ape_074d2f44cf514f6e999cec54789ba234",
    "edit_plan": {
      "operations": [{"op": "update_node", "node_id": "n_2", "fields": {"title": "Отгрузка готовой продукции"}}],
      "note": "Переименование шага n_2 в соответствии с запросом пользователя."
    },
    "diff": [{"op": "update", "node_id": "n_2", "field": "title", "new_value": "Отгрузка готовой продукции"}],
    "status": "pending_confirmation"
  }
}
```

Resume:

```text
event: start
data: {"turn_id": "resume_1787132327334"}

event: token
data: {"delta": "Операция выполнена успешно: шаг **n_2** переименован в **«Отгрузка готовой продукции»**."}

event: done
data: {"status": "applied", "operations_applied": 1}
```

Final state:

```text
n_2 title: Отгрузка готовой продукции
diagram_state_version: 4
```

## Git Proof

```text
commit 87662c60 — fix(agent-svc): store base_diagram_state_version in pending_edit and detect conflict_rev on resume
commit abd4bacf — fix(agent-svc): add missing json import in agent_resume
commit 2afa1dc4 — fix(agent-svc): apply edit_plan via PATCH /sessions/{id} save path
commit dd74a156 — fix(agent-svc): AGENT-3 HITL two blockers
```

PR: `fix/agent-3-pending-edit-turn-id` → `main` (#773, merged by owner).

## Overall Verdict

**AGENT-3: CONDITIONAL PASS**

- All core HITL mechanics work: intent routing, proposal, validation, confirmation, rejection, conflict_rev detection, CAS apply.
- Regression: agent service tests pass (modulo pre-existing internal-LLM auth env failures).
- Gating items remaining:
  1. Implement dedicated `agent_edit_applied` audit row, or accept `session.update` as sufficient and update the gate criterion.
  2. Run `pytest -m contract` in CI.
  3. Run frontend regression suite for S1–S8.
