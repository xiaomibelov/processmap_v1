# Subprocess Transition Architecture — PLANE 5: INFRASTRUCTURE

## Runtime topology

```
┌─────────────────────────────────────────┐
│  Browser (React + bpmn-js)              │
│  http://clearvestnic.ru:5180            │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Nginx gateway                          │
│  serves static build / proxies API      │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  FastAPI container                      │
│  http://clearvestnic.ru:8088            │
└─────────────────────────────────────────┘
                   │
        ┌─────────┴─────────┐
        ▼                   ▼
┌──────────────┐   ┌─────────────────┐
│ Postgres     │   │ Redis           │
│ sessions,    │   │ locks, cache,   │
│ versions,    │   │ session presence│
│ notes        │   │                 │
└──────────────┘   └─────────────────┘
```

## Sync vs async

Current subprocess transitions are **fully synchronous** from the user perspective:
- REST POST → FastAPI handler → DB writes → JSON response.
- Frontend awaits response, then activates session and updates URL.

This is appropriate because:
- The operation completes in milliseconds.
- The user cannot continue until the child session is visible.
- No external systems are involved.

What is missing is **internal asynchrony / concurrency control**:
- Concurrent navigate requests are not serialized.
- No queue protects the find-or-create critical section.

## Locking and concurrency

| Mechanism | Used today | Needed for transitions |
|-----------|------------|------------------------|
| DB transactions | Implicit per repository call | Yes — wrap find-or-create |
| Redis locks | Clipboard materializer only | Yes — child session creation |
| Postgres advisory locks | No | Optional alternative to Redis |
| Optimistic concurrency (`diagram_state_version`) | Session saves | Not directly for hierarchy creation |

## Retry / timeout

Current: no explicit retry. API failures are surfaced as toasts.

Recommended:
- **Frontend:** idempotent retry on `apiNavigateToSubprocess` only for transient 5xx / network errors; do not retry 4xx.
- **Backend:** Redis lock TTL ~5 seconds to prevent deadlocks; acquisition timeout ~2 seconds; fail fast with 503 if lock cannot be acquired.

## Scaling considerations

- `_resolve_child_bpmn_xml` scans all project session summaries and may load each candidate. For large projects this is O(N) and CPU-heavy.
- `_build_breadcrumbs` loads every session in the stack individually. Deep hierarchies multiply round-trips.

Mitigations:
- Bulk session loader keyed by `session_id[]`.
- Index `sessions(bpmn_meta->process_id)` for call-activity resolution.
- Cache child XML resolution by `(parent_session_id, element_id_in_parent)`.

## Serving mode and source truth

Per AGENTS.md §3, before any runtime claim we must verify:
- Code branch: `fix/bpmn-drilldown-ui` at `/opt/processmap-test`.
- Runtime URL: `http://clearvestnic.ru:5180` (test).
- API health: `http://clearvestnic.ru:8088/health`.

This audit is **read-only / planning**; no runtime mutation is performed. The recommended changes must be implemented and verified in a fresh contour before release.

## Infrastructure recommendations

1. Use Redis `SET NX EX` for subprocess child-creation lock.
2. Add DB unique partial index to enforce hierarchy invariant at persistence layer.
3. Introduce bulk session loader to replace N+1 breadcrumb queries.
4. Add index on `bpmn_meta->process_id` (or equivalent JSONB/GIN) for call-activity resolution.
5. Keep transitions synchronous for UX; add concurrency control, not async queues.
