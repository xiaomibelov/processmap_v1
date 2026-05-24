# Agent 2 / Executor Prompt

## Contour
- **ID**: `fix/diagram-5180-version-proof-and-canvas-lag-regression-v1`
- **Run ID**: `20260515T193732Z-46002`
- **Scope**: P0 combined runtime-version-proof and Diagram canvas lag/reload regression fix for ProcessMap test runtime on clearvestnic.ru:5180

## Read Before Starting
1. `PLAN.md` (this contour)
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. `STATE.json`
5. Latest reports from previous contours:
   - `.planning/contours/fix/diagram-canvas-reload-loop-and-lag-regression-v1/EXEC_REPORT.md`
   - `.planning/contours/fix/diagram-canvas-reload-loop-and-lag-regression-v1/REVIEW_REPORT.md`

## Source / Runtime Truth (Agent 2 Must Re-verify)
Before making any changes, record:
- `git branch --show-current`
- `git rev-parse HEAD`
- `git diff --name-only`
- `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "5180|gateway|frontend"`
- `curl -s "http://clearvestnic.ru:5180/?cb=$(date +%s)" | grep -oE "assets/[^\"' ]*\.(js|css)" | sort`
- `find frontend/dist/assets -maxdepth 1 -type f | sort`
- Container IDs and image IDs for gateway.

## Phase 1: Runtime Version Proof (MANDATORY)

### 1.1 Build Info Generator
Create `scripts/generate-build-info.js`:
- Runs `git rev-parse --short HEAD`, `git rev-parse HEAD`, `git branch --show-current`, `git diff --quiet` (for dirty flag).
- Generates `frontend/src/generated/buildInfo.js`:
```js
export const PROCESSMAP_BUILD_INFO = {
  branch: "fix/lockfile-sync-test",
  sha: "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  shaShort: "a9a9d9c",
  timestamp: "2026-05-15T19:22:00.000Z",
  contourId: "fix/diagram-5180-version-proof-and-canvas-lag-regression-v1",
  dirty: true,
  host: "clearvestnic.ru"
};
export default PROCESSMAP_BUILD_INFO;
```
- Generates `frontend/public/build-info.json` with same fields.

### 1.2 Build Integration
- Add to `frontend/package.json` scripts: `"prebuild": "node ../scripts/generate-build-info.js"`
- Or run manually before `npm run build` and document.
- Ensure `frontend/src/generated/` is in `.gitignore`.

### 1.3 UI Exposure
- In `frontend/src/App.jsx` (or root component), import `PROCESSMAP_BUILD_INFO`.
- On mount: `if (typeof window !== 'undefined') window.__PROCESSMAP_BUILD_INFO__ = PROCESSMAP_BUILD_INFO;`
- Add small non-intrusive marker:
```jsx
{PROCESSMAP_BUILD_INFO.branch?.includes('fix') && (
  <div style={{position:'fixed',bottom:2,right:2,fontSize:10,opacity:0.6,zIndex:9999,pointerEvents:'none'}}>
    {PROCESSMAP_BUILD_INFO.shaShort} | {PROCESSMAP_BUILD_INFO.timestamp}
  </div>
)}
```
- Only visible in test runtime (check host or branch name).

### 1.4 Delivery Loop Fix
**Investigate current delivery loop:**
- Check if `docker cp` is used (look in shell history, deploy scripts, Makefiles).
- Check `deploy/scripts/`, `bin/`, `scripts/` for deploy commands.

**Recommended fix: bind volume mount**
In `docker-compose.yml` (or `docker-compose.override.yml`), modify gateway service:
```yaml
gateway:
  # ... existing config ...
  volumes:
    - ./deploy/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    - ./frontend/dist:/usr/share/nginx/html:ro
```
- This makes gateway serve directly from host `frontend/dist`.
- No `docker cp` needed after build.
- No stale asset accumulation.
- Container restart NOT required after build.

**Alternative: if bind volume is not acceptable**
- Document exact `docker cp` command.
- Add cleanup: `docker exec processmap_test-gateway-1 sh -c 'rm -rf /usr/share/nginx/html/assets/*'` before copy.
- Then `docker cp frontend/dist/. processmap_test-gateway-1:/usr/share/nginx/html/`

**After any change, verify:**
```bash
curl -s http://clearvestnic.ru:5180/build-info.json
curl -s "http://clearvestnic.ru:5180/?cb=$(date +%s)" | grep -oE 'assets/index-[^"]+\.js'
md5sum frontend/dist/assets/index-*.js
# compare with served content-length or hash
```

## Phase 2: Canvas Lag / Reload Fix (ONLY after Phase 1 proven)

### 2.1 Baseline with Fresh Runtime
Use Playwright fresh context:
1. Open `http://clearvestnic.ru:5180/?cb=<timestamp>`.
2. Verify `window.__PROCESSMAP_BUILD_INFO__`.
3. Authenticate (inject token or use dev bypass).
4. Open session `wewe` / `Описание процессов Долгопрудный`.
5. Record:
   - Cold open timing (shell → skeleton → canvas → ready).
   - `.djs-container` count.
   - `svg` count.
   - Console errors.
   - Network requests.

### 2.2 Tab Switch Test
- Analysis → Diagram → Analysis → Diagram.
- XML → Diagram.
- Measure time, check for skeleton flash, check `.djs-container` count stability.

### 2.3 Pan/Zoom Test
- Programmatic or manual pan/zoom.
- Check responsiveness, DOM/SVG stability.

### 2.4 Counter Injection
Temporarily add to `BpmnStage.jsx` (dev-only, remove before review):
```js
if (typeof window !== 'undefined' && !window.__PM_DIAGRAM_DEBUG__) {
  window.__PM_DIAGRAM_DEBUG__ = {
    bpmnStageRenderCount: 0,
    bpmnStageMountCount: 0,
    importXMLCount: 0,
    diagramReadyTransitions: 0,
  };
}
// increment in relevant places
```

### 2.5 Fix Strategy Based on Evidence
If tab switch is still ~2-3s:
- Profile `useProcessTabs.js` tab switch path.
- Check if `interviewProjectionCacheRef` is working.
- Check if `parseAndProjectBpmnToInterview` still runs on every tab switch.
- Check if `useProcessTabs` causes `ProcessStage` re-render which remounts `BpmnStage`.

If canvas feels like it reloads:
- Check `BpmnStage` key prop in `ProcessStage.jsx`.
- Check if `sessionId` or `reloadKey` changes unexpectedly.
- Check `diagramReady` flapping.

If pan/zoom lags:
- Check CSS `filter: drop-shadow` rules (should already be reduced from prior contour).
- Check overlay count.
- Check if `requestAnimationFrame` is being blocked by JS work.

### 2.6 Allowed Changes
- Frontend files only.
- `useProcessTabs.js` stabilization.
- `BpmnStage.jsx` mount/render optimization.
- `ProcessStage.jsx` prop stability.
- Docker/test runtime workflow ONLY for version proof.

### 2.7 Not Allowed
- Backend changes.
- Package changes unless build flow explicitly requires.
- BPMN XML mutation.
- Product Actions / RAG / AG-UI.
- Stage/prod deploy.
- Commit/push/PR.

## Reports to Create

After execution, create in contour directory:
- `EXEC_REPORT.md` — what was done, build/test results, runtime evidence.
- `RUNTIME_VERSION_PROOF.md` — build marker details, curl proof, browser proof.
- `REGRESSION_ROOT_CAUSE.md` — what caused lag/reload, evidence.
- `RUNTIME_BEFORE_AFTER.md` — timings, DOM counts, network counts before and after.
- `DELIVERY_LOOP_NOTES.md` — exact delivery loop, commands used, container IDs.
- `IMPLEMENTATION_NOTES.md` — files changed, lines changed, rationale.
- `READY_FOR_REVIEW` marker file.

If blocked, create `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Important Reminders
- Do NOT start lag fix until version proof is confirmed on 5180.
- Do NOT claim success without material runtime improvement.
- Do NOT expose secrets in any report.
- Keep all changes bounded to this contour.
