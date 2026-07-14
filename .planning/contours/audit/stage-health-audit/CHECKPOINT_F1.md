# Checkpoint F1 — Autosave debounce 600 ms → 10 000 ms

**File changed:** `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js`

**Change:** pass `debounceMs: 10_000` into `createBpmnCoordinator` so production matches the value already used in test fixtures.

**Verification:**

```bash
cd /opt/processmap-test/frontend
node --test src/features/process/bpmn/stage/wiring/bpmnWiring.test.mjs \
            src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs
# 18 passed, 0 failed

npm run build
# ✓ built in 19.09s
```

**Expected runtime effect:** `PUT /api/sessions/{sid}/bpmn` now fires at most once per 10-second idle period during normal editing, eliminating the rapid autosave stream that caused CAS 409s.

**Status:** ready for next fix.
