# Updates (v1)

## Completed
- Added six focused unit tests to `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`:
  1. Interval heartbeats fire multiple times.
  2. Hidden tab suppresses interval heartbeat.
  3. Foreground event triggers heartbeat when visible.
  4. Missing sessionId or userId disables heartbeat.
  5. clientId is stable across re-mount in same tab.
  6. ttlMs updates from server ttl_seconds.
- Verified targeted test command passes (12/12 tests).
- Ran full frontend unit-test suite and documented one pre-existing unrelated failure.
- Wrote `EXEC_REPORT.md` and created `READY_FOR_REVIEW` marker.
- Updated `STATE.json` to `ready_for_review`.

## Environment note
Tests require Node.js >= 20 because `jsdom@28.1.0` / `@exodus/bytes@1.15.0` are incompatible with Node.js 18. Ran tests via `node:20-alpine` Docker with the frontend directory mounted.

## Finding
`useSessionPresence` clamps `heartbeatMs` to a minimum of 5000 ms, so interval-related tests use longer waits than the prompt's suggested 50 ms in order to observe real interval ticks. No product code was changed.
