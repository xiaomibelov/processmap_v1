# Deploy Status: perf/session-analysis-bpmn-tab-switch-load-regression-v1

## Runtime Proof (5 planes)

### 1. Code
- Branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- Modified files:
  - `frontend/src/components/ProcessStage.jsx`
  - `frontend/src/features/process/hooks/useProcessTabs.js`

### 2. Workspace
- Working directory: `/opt/processmap-test`
- `git status`: clean (only `.env` and pre-existing branch issues remain)

### 3. DB
- No DB schema or data migrations required for this frontend-only fix.

### 4. Env/Compose
- Gateway image rebuilt and retagged: `processmap_test-gateway:latest`
- Container recreated: `processmap_test-gateway-1` (Up 13s)
- All supporting services healthy: api, postgres, redis

### 5. Serving Mode
- URL: `http://clearvestnic.ru:5180`
- `Last-Modified: Thu, 14 May 2026 21:51:15 GMT` (post-fix build)
- JS bundle contains fix markers:
  - `interview_unchanged` string present ✅
  - `interviewProjectionCacheRef` logic present ✅
  - Toast rate-limit logic present ✅
  - In-flight dedupe for `updateList:false` present ✅

## Verification

```bash
curl -I http://clearvestnic.ru:5180/
# Last-Modified: Thu, 14 May 2026 21:51:15 GMT

curl -s http://clearvestnic.ru:5180/assets/index-DPy6kGdR.js | grep -c "interview_unchanged"
# 1
```

## Issues Resolved
- [x] Fix 1 — Stop `/bpmn/versions?limit=1` spam
- [x] Fix 2 — Eliminate PATCH on tab switch
- [x] Fix 3 — Cache projection
- [x] Fix 4 — Preserve Interview mount state
- [x] Fix 5 — Deduplicate error toasts
- [x] Gateway serving updated build

## Remaining
- Pre-existing build error in `ProductActionsRegistryPanel.jsx` (duplicate `const [page, setPage]`) — not in scope, exists on base branch.
