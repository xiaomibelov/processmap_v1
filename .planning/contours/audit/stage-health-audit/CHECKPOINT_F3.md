# Checkpoint F3 — Remote session sync poll 15 s → 30 s

**File changed:** `frontend/src/components/ProcessStage.jsx`

**Change:** `REMOTE_SESSION_SYNC_POLL_MS` increased from 15 000 ms to 30 000 ms.

**Verification:**

```bash
cd /opt/processmap-test/frontend
node --test src/components/ProcessStage.save-ack-toast-duration.test.mjs
# 2 passed, 0 failed

npm run build
# ✓ built in 18.90s
```

**Expected runtime effect:** during idle, `GET /api/sessions/{sid}/bpmn/versions?limit=1` drops from 4 req/min to 2 req/min. Combined with the app-update poll (0.5 req/min), non-presence idle traffic stays well below the 5 req/min target.

**Status:** ready for next fix.
