# Console Baseline Evidence

## Errors
- `[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized)` @ `/api/auth/me`
  - **Note**: This was immediately followed by a successful retry (200). Likely a race between auth initialization and first API call.

## Warnings
- None observed during runtime scenarios.

## Info / Debug
- BPMN canvas debug logs are present in code (`logCanvasMetrics`, `logBpmnTrace`) but did not appear in the production build console.
