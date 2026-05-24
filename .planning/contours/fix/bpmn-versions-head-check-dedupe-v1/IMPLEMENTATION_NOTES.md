# Implementation Notes

## Deviations from PLAN.md

### 1. `pollRemoteSessionSnapshot` was also guarded
- The PLAN.md exact tasks only mention guarding **useEffect B** (~line 5253).
- Runtime evidence showed that `pollRemoteSessionSnapshot` (line ~1519) fires `apiGetBpmnVersions(sid, { limit: 1 })` on a fixed 9 s interval (`REMOTE_SESSION_SYNC_POLL_MS = 9000`).
- Without guarding this path, the acceptance criterion "0 or at most 1 call in 30 s" could not be met.
- **Mitigation**: added the same `lastHeadCheckRef` cooldown guard inside `pollRemoteSessionSnapshot`. This is a minor helper change in the same file, which is within the allowed bounds.

### 2. Cooldown raised from suggested 5–10 s to 30 s
- PLAN.md suggested `HEAD_CHECK_COOLDOWN_MS` of 5–10 s.
- A 8 s test was attempted; because the poll interval is 9 s, each poll occurred **after** the cooldown expired, so no blocking happened.
- Raised to **30 s** to actually throttle the 9 s poll.
- Explicit callers (BPMN import, etc.) use `bypassCooldown: true`, so they are unaffected.

## Preserved Behaviors

| Caller | Path | Status |
|---|---|---|
| useEffect A (history modal open) | `refreshSnapshotVersions()` | **Untouched** — still fetches full list when `versionsOpen === true` |
| BPMN import load | `refreshLatestBpmnRevisionHead({ bypassCooldown: true })` | **Preserved** — explicit bypass |
| Save/publish response | Direct state update of `latestBpmnVersionHead` | **Untouched** — no extra head-check added |
| `bpmnVersionsListRequestRef` in-flight dedupe | `refreshSnapshotVersions` internal guard | **Untouched** — still active |

## No Regressions Introduced

- Backend files: **unchanged**
- `api.js` / `apiRoutes.js` contracts: **unchanged**
- BPMN XML mutation logic: **unchanged**
- Overlay viewport-culling logic: **unchanged**
- Product Actions / RAG / AG-UI: **unchanged**
- `.env` files: **unchanged**
