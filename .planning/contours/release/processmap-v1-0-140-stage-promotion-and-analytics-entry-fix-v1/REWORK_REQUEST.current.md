# REWORK REQUEST — release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1

- run_id: `20260521T101201Z-83263`
- reviewer: Agent 4
- requested_at: `2026-05-21T10:29Z`

## Required Fix

### 1. Regenerate build metadata and rebuild dist

The executor built the frontend dist at ~10:26 but failed to regenerate `build-info.json` and `buildInfo.js` before building. As a result, all build metadata contains the **stale SHA `29550c7`** and timestamp `09:31` from the previous commit instead of the current HEAD `dd1c535`.

**Exact steps:**

```bash
cd /opt/processmap-test
node scripts/generate-build-info.mjs
cd frontend
npm run build
```

**Verify:**
- `frontend/dist/build-info.json` must contain `"sha": "dd1c535..."` (or the new HEAD after the fix commit)
- `frontend/dist/build-info.json` must contain a fresh timestamp
- `frontend/src/generated/buildInfo.js` must contain the same fresh metadata

**Commit:**
```bash
git add frontend/public/build-info.json frontend/src/generated/buildInfo.js
git commit -m "chore(build): regenerate build-info.json for v1.0.141"
git push origin feature/process-properties-registry-backend-contract-v1
```

## Pending Items (Not Fixable by Agent 3 Alone)

These items are blocked on external/user actions and are documented here for the final review:

1. **User approval for merge to main** — Required per AGENTS.md §7. Agent 3 must obtain explicit "yes" from user before merging.
2. **Merge to main** — Fast-forward or PR merge after user approval.
3. **Deploy to stage** — Run deploy scripts in `deploy/`.
4. **Runtime verification** — `curl -I http://clearvestnic.ru:5180` must return HTTP 200 with fresh `Last-Modified`.

## Acceptance Criteria for Resubmission

- [ ] `frontend/dist/build-info.json` has fresh SHA matching HEAD and `dirty: false`
- [ ] `frontend/src/generated/buildInfo.js` has fresh SHA matching HEAD
- [ ] Branch pushed to origin with the fix commit
- [ ] User approval for merge is still pending (expected)
