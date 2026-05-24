# Network Evidence

## Critical Finding: Excessive Duplicate `/bpmn/versions?limit=1` Requests

During a ~4-minute runtime observation with minimal user interaction (load, 3 tab switches, enable overlays, zoom/pan), the endpoint:

```
GET /api/sessions/{id}/bpmn/versions?limit=1
```

was called **26+ times** for the same session.

### Request Log (selected)

| # | Context |
|---|---------|
| 19 | Initial load |
| 21 | Immediately after initial load |
| 24–28 | Cluster of 5 duplicate calls within seconds |
| 30–35 | After first tab switch (Analysis → Diagram) |
| 37–41 | After second interaction |
| 43–45, 47, 49–50 | After page reload with overlays enabled |
| 52–55 | After subsequent interactions |

### Root Cause Analysis

1. **`ProcessStage.jsx:1518`** calls `apiGetBpmnVersions(sid, { limit: 1 })` as a "head check" to detect if the server has newer BPMN versions.
2. This head check is triggered from multiple places:
   - Session open / initial load
   - Tab switch (Analysis ↔ Diagram)
   - `saveLocalFromModeler` / autosave flow
   - Presence polling side effects
3. While `ProcessStage.jsx` implements request deduplication via `bpmnVersionsListRequestRef`, the **triggering logic** (effects that call `refreshSnapshotVersions`) fires repeatedly.
4. The dedupe key includes `updateList` and `trackHeadStatus`, but different call sites may pass different flags, causing cache misses.

### Impact

- **Server load**: 26× unnecessary database queries for a 5-element interaction session.
- **Client main thread**: Each fetch creates microtask queue pressure and potential layout thrashing if the result triggers a state update.
- **No user value**: The user never opened the BPMN history modal; these head checks are speculative.

## Abort-Race Requests

Multiple `DELETE /presence` and `PUT /bpmn` requests were aborted (`net::ERR_ABORTED`):

| # | Method | Endpoint |
|---|--------|----------|
| 2 | DELETE | `/api/sessions/4c515d1c6e/presence` |
| 3 | PUT | `/api/sessions/4c515d1c6e/bpmn` |
| 4 | DELETE | `/api/sessions/4c515d1c6e/presence` |
| 5 | DELETE | `/api/sessions/4c515d1c6e/presence` |
| 6 | PUT | `/api/sessions/4c515d1c6e/bpmn` |
| 7 | DELETE | `/api/sessions/4c515d1c6e/presence` |

**Interpretation**: Rapid unmount/remount or `useEffect` cleanup races cancel in-flight requests. This correlates with H13 (unstable cleanup) and H6 (repeated fetches).

## Mutation Without Explicit Save

A `PUT /api/sessions/4c515d1c6e/bpmn` succeeded (request 46) during the observation. The user did **not** press an explicit Save button during this period. This suggests:
- Autosave trigger on overlay state change
- Background sync on tab switch
- `commandStack.changed` listener firing a silent save

This supports **H8** (Mutation on non-edit interaction).

## Console Error

```
[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized)
@ http://clearvestnic.ru:5180/api/auth/me
```

- Recovered immediately with 200 on retry.
- Likely auth initialization race; low performance impact.
