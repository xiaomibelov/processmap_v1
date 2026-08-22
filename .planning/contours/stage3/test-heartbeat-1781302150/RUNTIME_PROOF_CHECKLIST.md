# RUNTIME_PROOF_CHECKLIST — stage3/test-heartbeat-1781302150

## Proof target
The heartbeat scheduling behavior of `useSessionPresence` is correctly exercised in the Node + jsdom test runtime.

## Checklist (to be filled by Worker / Reviewer)

### Worker
- [ ] `npm test -- src/features/process/stage/presence/useSessionPresence.test.mjs` passes locally.
- [ ] `npm test` (full frontend suite) passes locally.
- [ ] No modifications to `useSessionPresence.js` or other product files.
- [ ] New tests cover all six acceptance criteria from PLAN.md §5.

### Reviewer (independent verification)
- [x] Re-ran `npm test -- src/features/process/stage/presence/useSessionPresence.test.mjs`.
- [x] Re-ran `npm test` (full frontend suite).
- [x] Confirmed only `useSessionPresence.test.mjs` changed.
- [x] Verified each new test maps to an acceptance criterion.

## Known limitations
- Flaky timing can occur if jsdom timers drift. Mitigation: short `heartbeatMs` and small `wait()` windows.
- This checklist does not cover live-browser runtime because the contour scope is unit tests only.
