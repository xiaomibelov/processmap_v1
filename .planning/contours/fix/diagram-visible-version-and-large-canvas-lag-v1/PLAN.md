# fix/diagram-visible-version-and-large-canvas-lag-v1

## GSD Discipline

- **GSD availability result**: All GSD tooling present and functional.
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - 50+ `gsd-*` skills present in `/root/.codex/skills`
- **Commands checked**: `gsd-tools` usage verified (commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init)
- **Mode**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Discipline notes**:
  - Implementation not executed by Agent 1.
  - Product files not changed by Agent 1.
  - Contour bounded to visible version + large canvas lag.
  - Decomposition-first gates prepared.
  - Agent 2 / Agent 3 gates prepared below.

## Source / Runtime Truth

### Git truth
- `pwd`: `/opt/processmap-test`
- `whoami`: `root`
- `hostname`: `clearvestnic.ru`
- `date -Is`: `2026-05-15T20:39:06+00:00`
- `git branch --show-current`: `fix/lockfile-sync-test`
- `git rev-parse HEAD`: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- `git rev-parse origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- `git status -sb`: 34 modified files, many untracked files (pre-existing from prior contours)
- Working tree is **dirty**.

### Docker truth
- Gateway (`processmap_test-gateway-1`): `0.0.0.0:5180->80/tcp`, bind volume `./frontend/dist:/usr/share/nginx/html:ro`
- API (`processmap_test-api-1`): `0.0.0.0:8088->8000/tcp`
- Frontend builder (`processmap_test-frontend-1`): `5177/tcp`

### Runtime proof (curl)
- `curl http://clearvestnic.ru:8088/health` → `{"ok":true,...}`
- `curl -I http://clearvestnic.ru:5180` → HTTP/1.1 200 OK, nginx/1.27.5
- `curl http://clearvestnic.ru:5180/build-info.json`:
  ```json
  {
    "branch": "fix/lockfile-sync-test",
    "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
    "shaShort": "a9a9d9c",
    "timestamp": "2026-05-15T20:03:56.411Z",
    "contourId": "fix/diagram-5180-version-proof-and-canvas-lag-regression-v1",
    "dirty": true,
    "host": "clearvestnic.ru"
  }
  ```
- Served assets: `assets/index-Xi1hejo7.js`, `assets/index-N6LiXuk7.css`
- Local dist assets match served assets.

### Critical runtime observation
- `build-info.json` `contourId` still references **previous contour** (`fix/diagram-5180-version-proof-and-canvas-lag-regression-v1`). This is expected (records builder), but it proves the runtime was last built during that contour.

## User-Reported Issues

1. **Canvas lag persists** on large schemes even without overlays.
2. **Overlays OFF** scenario (`.fpcPropertyOverlay = 0`) still lags.
3. **No perceived improvement** from previous performance contours.
4. **Canvas feels worse** after some changes.
5. **Page/Diagram loads multiple times** (suspected repeated reload cycles).
6. **Version visibility is unclear**: UI still shows only "ProcessMap 1.0.126".
7. `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` exist but are **not sufficient** — user does not see version in UI without devtools.
8. **REVIEW_PASS is blocked** without real UI-visible version and material canvas improvement.

## Visible Version Plan

### Current state
- `frontend/src/config/appVersion.js` → `currentVersion: "v1.0.126"`
- `frontend/src/components/AppShell.jsx:352` → `Версия {appVersionInfo.currentVersion}` — **this is the only obvious version UI**
- `frontend/src/components/AppShell.jsx:357-359` → tiny fixed-position badge at bottom-right (`fontSize: 10`, `opacity: 0.6`, `pointerEvents: none`). This badge is **practically invisible** to users.
- `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` exist but require devtools or curl.

### Required change
Integrate build metadata **into the existing visible version area** so the user can see at a glance that the runtime is current.

Options (Agent 2 chooses safest):
1. **Append to AppShell version label**: `Версия v1.0.126 · a9a9d9c · 2026-05-15 19:50`
2. **Expand the existing badge** to be more visible (larger, higher opacity, positioned near version text).
3. **Add a discrete but readable build bar/footer** inside the app shell, visible only on test runtime (host gate already exists).

Constraints:
- Must not expose secrets.
- Must preserve `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__`.
- Must be visible in browser UI on 5180 without devtools.
- Must reuse existing host/branch gate if present (current gate: `branch?.includes("fix") || window.location.host === "clearvestnic.ru:5180"`).
- Must update build-info generator to record current contour id on next build.

## 5180 Delivery Proof Plan

- After any frontend change, run `npm run build` in `frontend/`.
- Verify `frontend/dist/build-info.json` contains matching SHA/timestamp.
- Verify gateway serves updated `index.html` with new asset hashes.
- Use `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"` to confirm.
- Use fresh browser context (cache-bust `?cb=<timestamp>`) to confirm visible marker.
- Document served asset hashes in `VISIBLE_VERSION_PROOF.md`.

## Large Canvas Lag Reproduction Plan

### Baseline scenario (Agent 2 must run before code changes)
1. Open `http://clearvestnic.ru:5180/?cb=<timestamp>` fresh context.
2. Navigate to known large session: `wewe / Описание процессов Долгопрудный`.
3. Ensure overlays OFF (`include_overlay=0` or `.fpcPropertyOverlay = 0`).
4. Record DOM/SVG counts:
   - `document.querySelectorAll('*').length` (~8,025 in prior audit)
   - `document.querySelectorAll('svg *').length` (~2,392 in prior audit)
   - `.djs-container` count (=1 expected)
   - `.fpcPropertyOverlay` count (=0 expected)
   - `.djs-overlay` count (~17 expected)
   - `.djs-bendpoint` count (=0 expected in view mode)
   - `.djs-segment-dragger` count (=0 expected in view mode)
5. Perform 10 pan/zoom cycles, record smoothness and DOM deltas.
6. Select 10 elements, record DOM deltas and property panel latency.
7. Switch Analysis → Diagram → XML → Diagram, record time to usable canvas and whether `.djs-container` stays at 1.
8. Record `importXML` / modeler / viewer create counts if instrumentation available.

### Target
- Pan/zoom must be **materially smoother** (subjective + measured).
- Tab switch must **not feel like full reload**.
- No repeated canvas reload cycles.
- No unnecessary `importXML` / modeler re-init.

## Modeler / Viewer Source Map

### Version / build-info targets
| Path | Role | Relation | Safe change area | Risk |
|------|------|----------|------------------|------|
| `frontend/src/config/appVersion.js` | Semantic version source | `currentVersion: "v1.0.126"` | Read-only for this contour | Low |
| `frontend/src/components/AppShell.jsx` | App shell, version display | `Версия {appVersionInfo.currentVersion}` + tiny badge | Integrate build info into visible version area | Low |
| `frontend/src/generated/buildInfo.js` | Generated build metadata | Imported by AppShell | Regenerated on build | Low |
| `scripts/generate-build-info.mjs` | Build info generator | Writes buildInfo.js + public/build-info.json | Update contourId if needed | Low |
| `frontend/package.json` | Build scripts | `prebuild` runs generator | Already correct | Low |

### Modeler/Viewer targets
| Path | Role | Relation | Safe change area | Risk |
|------|------|----------|------------------|------|
| `frontend/src/components/process/BpmnStage.jsx` | Main diagram stage | Holds `viewerRef` and `modelerRef`; `ensureViewer()`, `ensureModeler()` | Switch default view to Viewer if safe | **High** — god file |
| `frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js` | Viewer/Modeler lifecycle | `importXML` for viewer and modeler | Dedupe, token checks already present | Medium |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Decor fanout | Uses `viewerRef` + `modelerRef` | Ensure works with Viewer-only mode | Medium |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Event wiring | Branches analytics vs edit mode | Preserve analytics mode on Viewer | Medium |
| `frontend/src/features/process/hooks/useProcessTabs.js` | Tab management | Heavily modified (dirty) | May need tab shell stabilization | Medium |
| `frontend/src/components/ProcessStage.jsx` | Process stage shell | Calls `bpmnSync.importXml(text)`, interview projection | Avoid unnecessary BPMN flush on tab switch | **High** — god file |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Decor management | Viewport culling, overlay layout | Preserve in Viewer mode | Low |
| `frontend/src/features/process/bpmn/stage/analytics/` | Analytics selection layer | Selection-lite, `fpcAnalyticsSelected` | Must work on Viewer | Low |

### Key architectural fact
- `BpmnStage.jsx` **already has both `viewerRef` and `modelerRef`**.
- `ensureViewer()` already imports `bpmn-js/lib/NavigatedViewer` and instantiates a Viewer.
- This means **viewer-first split is architecturally possible** without adding new dependencies.
- The question is whether the default view/analytics path currently uses `modelerRef` or `viewerRef`.

## Hypotheses

| ID | Hypothesis | Evidence | Priority |
|----|-----------|----------|----------|
| H1 | UI version marker not integrated with existing visible app version | User sees only "ProcessMap 1.0.126"; tiny badge at bottom-right is invisible | **P0 — must fix** |
| H2 | Runtime version proof works technically but not user-visibly | curl/window marker exist, but no obvious UI marker | Confirmed | P0 |
| H3 | Large no-overlays lag is due to bpmn-js Modeler being used in view mode | `modelerRef` is heavily used in `BpmnStage.jsx`; `viewerRef` exists but may not be default for view | **P0 — primary canvas fix candidate** |
| H4 | Tab switch lag comes from useProcessTabs / parent shell | `useProcessTabs.js` dirty; `ProcessStage.jsx` dirty; ~2.2-3.5s delay documented | High — secondary target |
| H5 | importXML/modeler init repeats unnecessarily | `bpmnRenderRuntimeLifecycle.js` has token-based cancellation; need to verify no repeats in practice | Medium |
| H6 | bpmn-js init is one-time but slow | Prior audit: ~3.7s cold open; Viewer init should be faster than Modeler | Medium |
| H7 | pan/zoom lag is SVG scene/render cost | No overlays/mutations, but pan/zoom may still lag on large SVG | Low — only if H3 insufficient |
| H8 | property panel update blocks after selection | Prior audit: ~799ms panel latency | Low — backup target |
| H9 | Previous improvements are now visible only after cache-bust/current bundle | User perception may be affected by stale assets; delivery loop now fixed | Documented |

## Bounded Implementation Strategy

### Part A — Visible Version (Mandatory)
1. Update `AppShell.jsx` to show build metadata **in or near** the existing version text.
2. Options:
   - Append short SHA + timestamp to `Версия v1.0.126` line.
   - Or make the existing badge more prominent (move to header, increase size).
3. Keep the host/branch visibility gate.
4. Ensure `scripts/generate-build-info.mjs` records current contour id.
5. Rebuild frontend, restart gateway if needed.
6. Prove with curl + fresh browser screenshot.

### Part B — Large Canvas Lag (Choose based on evidence)

**Primary option: Viewer-first analysis/view mode**
- If source evidence shows default view uses Modeler:
  - Change default view/analytics path to use `viewerRef.current` (NavigatedViewer).
  - Ensure analytics selection-lite works on Viewer (`addMarker`/`removeMarker`).
  - Ensure property panel still receives selected element.
  - Ensure pan/zoom works (NavigatedViewer includes zoom scroll).
  - Keep `modelerRef` for explicit Edit BPMN mode only.
  - Do not instantiate Modeler until edit mode is activated.
- If source evidence shows view already uses Viewer:
  - Document and move to next strongest hypothesis.

**Secondary option: useProcessTabs / tab-shell stabilization**
- If tab switch dominates measured latency:
  - Prevent unnecessary parent re-render / BPMN flush on tab switch.
  - Keep Diagram mounted via CSS visibility toggle instead of unmount/remount.
  - Document exact bottleneck.

**Tertiary option: Import/init dedupe**
- If `importXML` or modeler/viewer creation repeats:
  - Key by `sessionId + bpmn_xml_version`.
  - Avoid destroy/recreate unless XML changed.

**Rollback option**
- If a specific recent contour change is identified as worsening canvas:
  - Revert the precise culprit.

## Acceptance Criteria

### Version
1. Visible UI marker exists on 5180.
2. It shows app version + short SHA + build timestamp or equivalent.
3. `/build-info.json` returns matching SHA/timestamp.
4. `window.__PROCESSMAP_BUILD_INFO__` returns matching SHA/timestamp.
5. Browser fresh context proof captured.
6. Served assets match local dist.

### Canvas
7. Large no-overlays Diagram is tested.
8. `.fpcPropertyOverlay = 0` confirmed for no-overlay scenario.
9. Pan/zoom is materially smoother or measured latency improves.
10. If viewer-first implemented, default view mode does not create Modeler/editor affordances.
11. Selection-lite works.
12. Property panel works.
13. Tab switch does not feel like full reload; if still slow, exact next bottleneck is documented.
14. No repeated canvas reload cycles.
15. No unnecessary importXML/modeler/viewer re-init.

### Safety
16. 0 PUT `/bpmn` from view interactions.
17. 0 PATCH `/sessions` from view interactions.
18. No versions spam regression.
19. No backend/schema/storage changes.
20. No BPMN XML mutation.
21. No Product Actions/RAG/AG-UI changes.
22. Build/tests pass.

### Strict material result
23. "Версия есть только в devtools" = fail.
24. "Performance same as before" = fail.
25. "No measurable improvement, but source looks cleaner" = fail.
26. "Changed code but 5180 marker stale" = fail.
27. "Reviewer did not use fresh browser/cache-busted 5180" = fail.

## Non-goals

- No Product Actions changes.
- No registry/reester changes.
- No AG-UI changes.
- No RAG changes.
- No stage/prod deploy.
- No PR/merge/push.
- No backend/schema/storage unless blocked and explicitly justified.
- No BPMN XML semantics change.
- No WebGL/canvas replacement.
- No broad app refactor.
- No cosmetic-only change.
- No unrelated CSS tweaks.

## Agent 2 Execution Plan

1. Read PLAN.md, STATE.json, this file.
2. Capture source/runtime truth (branch, HEAD, dirty files).
3. **Baseline large canvas** before any code change:
   - Open large session on 5180 with cache-bust.
   - Record DOM/SVG, pan/zoom, selection, tab switch.
   - Determine whether default view uses Modeler or Viewer.
4. **Implement visible version**:
   - Modify `AppShell.jsx` to show build metadata in obvious version area.
   - Update `scripts/generate-build-info.mjs` contourId if needed.
   - Rebuild, verify 5180.
5. **Implement canvas lag fix** (based on baseline evidence):
   - If Modeler is default in view mode → implement Viewer-first default.
   - If tab switch dominates → stabilize tab shell.
   - If import repeats → dedupe.
6. **Validate**:
   - Build/tests pass.
   - 5180 fresh browser: visible version confirmed.
   - Large no-overlays canvas: before/after recorded.
   - Pan/zoom, selection, property panel, tab switch all tested.
   - Network: 0 PUT/PATCH from view interactions.
7. **Create reports**:
   - `EXEC_REPORT.md`
   - `VISIBLE_VERSION_PROOF.md`
   - `LARGE_CANVAS_BASELINE.md`
   - `CANVAS_LAG_ROOT_CAUSE.md`
   - `RUNTIME_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `VIEWER_FIRST_DESIGN.md` (if applicable)
   - `READY_FOR_REVIEW`
   - If blocked: `EXEC_BLOCKED.md` instead of `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. Read all Agent 2 reports.
2. Verify source HEAD and served assets match.
3. Open fresh browser context on `http://clearvestnic.ru:5180/?cb=<timestamp>`.
4. **Visible version check**:
   - Screenshot or textual proof of visible marker in UI.
   - Verify it includes app version + SHA + timestamp.
   - Verify `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` match.
5. **Canvas check**:
   - Open large Diagram, overlays OFF.
   - Pan/zoom — record smoothness and DOM counts.
   - Selection — verify selection-lite, property panel.
   - Tab switch — verify no full reload, `.djs-container` stays at 1.
   - Verify no repeated importXML/modeler re-init.
6. **Network check**:
   - 0 PUT `/bpmn` from view interactions.
   - 0 PATCH `/sessions` from view interactions.
   - No versions spam.
7. **Verdict**:
   - If visible version missing → `CHANGES_REQUESTED`.
   - If 5180 stale → `CHANGES_REQUESTED`.
   - If canvas not materially improved → `CHANGES_REQUESTED`.
   - If pass → `REVIEW_PASS` + `REVIEW_REPORT.md`.

## Risks

1. **Dirty working tree**: 34 modified files from previous contours. Agent 2 must not accidentally include unrelated changes.
2. **BpmnStage.jsx god file**: Any change risks unintended side effects. Decomposition-first if touching this file.
3. **Viewer-first may break edit mode**: Must ensure explicit edit path still works.
4. **User perception gap**: Objective metrics may improve but user may still feel lag if tab switch (~2.2-3.5s) dominates.
5. **Auth barrier for Playwright**: Prior reviews hit auth issues on 5180. Agent 3 may need to rely on Agent 2 evidence if independent Playwright auth fails.
6. **Mixed runtime containers**: Multiple docker compose stacks running. Ensure 5180 gateway is the correct one.

## Gates

| Gate | Name | Status |
|------|------|--------|
| Gate 1 | GSD discipline completed | ✅ PASS |
| Gate 2 | Source/runtime truth captured | ✅ PASS |
| Gate 3 | Current visible version gap documented | ✅ PASS |
| Gate 4 | 5180 delivery/version proof plan defined | ✅ PASS |
| Gate 5 | Large no-overlays canvas baseline plan defined | ✅ PASS |
| Gate 6 | Modeler/viewer/source-map targets defined | ✅ PASS |
| Gate 7 | Decomposition-first plan defined if god files touched | ✅ PASS (BpmnStage/ProcessStage are god files; viewer-first must be bounded and safe) |
| Gate 8 | Material improvement criteria defined | ✅ PASS |
| Gate 9 | Rollback/rework strategy defined | ✅ PASS |
| Gate 10 | Agent 2 executor prompt ready | ✅ PASS |
| Gate 11 | Agent 3 reviewer prompt ready | ✅ PASS |
| Gate 12 | READY_FOR_EXECUTION marker created | ✅ PASS |

**ALL GATES PASS — PLANNING COMPLETE.**
