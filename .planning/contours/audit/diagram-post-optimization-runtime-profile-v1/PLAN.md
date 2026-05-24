# audit/diagram-post-optimization-runtime-profile-v1

## GSD Discipline

- GSD availability result: **AVAILABLE**
- Commands executed:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found
- Mode used: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Implementation was NOT executed.
- Product files were NOT changed.
- Contour is bounded to read-only audit/profiling.
- Agent 2 / Agent 3 gates are prepared in this plan.

## Previous Evidence Source Truth

Reviewed 10 completed Diagram performance contours. All achieved REVIEW_PASS.

| # | Contour | Key Result |
|---|---------|-----------|
| 1 | audit/diagram-property-overlays-performance-gsd-v1 | Diagram does not remount on tab switch; overlay DOM inflation confirmed; versions head-check spam confirmed; non-edit PUT observed |
| 2 | perf/diagram-property-overlays-viewport-culling-v1 | `.fpcPropertyOverlay` reduced ~180→70 in default viewport; pan/zoom stable; no duplicates |
| 3 | fix/bpmn-versions-head-check-dedupe-v1 | `/bpmn/versions?limit=1` spam reduced ~80%; tab switch 0 extra calls |
| 4 | fix/diagram-non-edit-put-bpmn-guard-v1 | 0 PUT/PATCH from idle/pan/zoom/selection/hover/tab switch; 4-layer frontend guard |
| 5 | perf/diagram-eventbus-listener-and-raf-coalescing-v1 | eventBus cleanup + RAF coalescing; readySignal stable; no DOM growth from stress |
| 6 | audit/diagram-baseline-no-overlays-canvas-profile-v1 | Baseline DOM 8,025 / SVG 2,392; old selection DOM delta +3,200; selection was dominant bottleneck |
| 7 | fix/diagram-decor-pipeline-disable-when-overlays-off-v1 | Overlays-off baseline exact: DOM 8,025 / SVG 2,392; tab stable; 0 PUT/PATCH |
| 8 | feature/diagram-analytics-layer-selection-lite-decomposition-first-v1 | Selection DOM delta reduced +3,424 → +238 (≈93%); `fpcFocusDim`=0; `djs-bendpoint`=0; edit mode path preserved |
| 9 | perf/diagram-derived-maps-and-render-boundary-v1 | ProcessStage -272 lines; stable derived model modules; `interviewDecorSignature` uses stable prop dependency; build/tests pass |
| 10 | perf/diagram-svg-css-repaint-reduction-v1 | 43 drop-shadow rules reduced/removed; 4 box-shadow rules reduced; selection DOM delta +137–239; SVG +2–27; pan/zoom delta 0 |

**Current aggregate state after all contours:**
- Idle baseline: DOM 8,025 / SVG 2,392 / `.fpcPropertyOverlay`=0 / `.djs-overlay`=17
- Analytics selection delta: DOM +137 to +239 / SVG +2 to +27
- Pan/zoom delta: 0
- Tab switch: stable, no remount
- Network: 0 PUT `/bpmn`, 0 PATCH `/sessions`, versions `limit=1` background polls only
- Pre-existing 401 on `/presence` remains

Despite these objective improvements, user reports **subjective lag persists**.

## Source / Runtime Truth

Captured at 2026-05-15T16:41:58+00:00 on clearvestnic.ru:

| Fact | Value |
|------|-------|
| pwd | /opt/processmap-test |
| whoami | root |
| hostname | clearvestnic.ru |
| git branch | fix/lockfile-sync-test |
| HEAD | a9a9d9c5f468d9da63415306da6d34dcd605aa0d |
| origin/main | d805e1c64c1107b9e3fe6854e031694bf741b187 |
| API health | `{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy"...}` |
| Frontend | HTTP/1.1 200 OK (nginx/1.27.5) |
| Runtime URL | http://clearvestnic.ru:5180 |
| API URL | http://clearvestnic.ru:8088 |

Working tree contains pre-existing uncommitted modifications from earlier contours on branch `fix/lockfile-sync-test`. This contour does NOT add product code changes.

## Problem Statement

After 10 completed optimization contours with objective metric improvements, the user still perceives lag. This contour is a **post-optimization runtime profile** to determine the **residual bottleneck** and decide whether more Diagram work is justified or effort should shift elsewhere.

### Residual Bottleneck Hypotheses

| ID | Hypothesis | Previous Evidence |
|----|-----------|-------------------|
| H1 | Initial Diagram open remains heavy | Not directly measured since baseline audit; XML import + first paint may dominate |
| H2 | Pure SVG/bpmn-js baseline still has repaint cost | Baseline is smooth but first paint / large SVG scene may still be expensive |
| H3 | Edit mode remains heavy | Analytics mode optimized; edit mode reverts to full `setSelectedDecor` path with +3,400 DOM delta |
| H4 | Large diagram scale dominates | `wewe` session has ~276 elements; small vs large comparison never done |
| H5 | Test runtime / server / browser factor | clearvestnic.ru may differ from stage/prod; never isolated |
| H6 | React/session shell triggers unrelated updates | ProcessStage + AppShell have 70+ state values and 14+ ref-sync effects |
| H7 | Property panel / side panel update cost | Selection is cheap, but opening/updating property panel may be slow |
| H8 | Overlays ON still expensive in some cases | Viewport culling helped, but dense diagrams or zoomed-out view may still suffer |
| H9 | CSS/layout/paint still visible in traces | Some drop-shadow rules remain (start/end events, flash decorators, quality decorators) |
| H10 | Network or auth/presence noise | 401 `/presence` race remains; background polls continue |

## Post-Optimization Profiling Scenarios

Agent 2 must execute scenarios A–J where feasible. All scenarios are **read-only**.

### Scenario A — Initial session open to Diagram
1. Open runtime fresh.
2. Open known session with Diagram.
3. Measure: time to app loaded, session visible, Diagram tab visible, canvas ready, first paint, network count, console errors, DOM/SVG counts at idle.

### Scenario B — Diagram tab switch after loaded
1. Diagram → Analysis → Diagram (3 cycles).
2. Diagram → XML → Diagram (3 cycles).
3. Measure: time to visible, DOM/SVG counts, overlay counts, network calls, mutations, console errors.

### Scenario C — Analytics selection
1. Select 10 BPMN elements in analytics/view mode.
2. Measure: DOM/SVG delta, `fpcAnalyticsSelected` count, `fpcFocusDim`, bendpoints/draggers, property panel update latency, visible lag.

### Scenario D — Hover
1. Hover 10 BPMN elements.
2. Measure: hover feedback latency, CSS filter/shadow, DOM/SVG stability, console/network.

### Scenario E — Pan/zoom
1. Perform 10 pan/zoom cycles.
2. Measure: visible smoothness, DOM/SVG delta, overlay count stability, long task indicators if available.

### Scenario F — Overlays ON
1. Enable/show property overlays if available.
2. Measure: `.fpcPropertyOverlay` count, `.djs-overlay` count, DOM/SVG counts, pan/zoom stability, zoomed-out vs zoomed-in counts, visible lag.

### Scenario G — Overlays OFF
1. Ensure overlays off.
2. Repeat selection/pan/zoom.
3. Compare to Scenario F.

### Scenario H — Property panel
1. Select element → open property panel → change nothing → select another element.
2. Measure: panel render/update latency, no mutation, no full derived model rebuild if detectable.

### Scenario I — Edit mode (if safely accessible)
1. Enter explicit edit mode if available.
2. Select BPMN element.
3. Measure: DOM/SVG delta, handles/draggers, visible lag.
4. Do NOT save unless safe test session path exists.
5. Exit edit mode if available.

### Scenario J — Small vs large diagram comparison (if feasible)
1. Find/compare small session/diagram vs current `wewe` or larger session.
2. Measure: element count, SVG count, initial open, selection, pan/zoom.
3. If only one session available, document limitation.

## Measurement Plan

### A. Counts
Use browser snippets (adjust selectors if needed):
```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcFocusDim').length
document.querySelectorAll('.fpcAnalyticsSelected').length
document.querySelectorAll('.djs-bendpoint').length
document.querySelectorAll('.djs-segment-dragger').length
```

### B. Network
For each scenario, count:
- PUT `/bpmn`
- PATCH `/sessions`
- `/bpmn/versions?limit=1`
- `/bpmn/versions?limit=50`
- `/sessions/{id}`
- `/sessions/{id}/bpmn`
- Failed requests
- Auth/presence errors

### C. Timings
Use `performance.now` where feasible; Playwright timing around route open, Diagram visible, canvas ready, selection property panel visible, pan/zoom stable.

### D. Performance categories
If Chrome trace feasible, summarize: Scripting, Recalculate Style, Layout, Paint, Composite, Long tasks. If not feasible, document fallback.

### E. Subjective notes
Agent 2 must explicitly note: where lag is visible, what action caused it, whether first-time only or repeated, whether it worsens over time.

### F. Source check
No code changes, but source review should identify: which subsystem is likely involved, whether current code path matches observed lag, what next contour should target.

## Source Map Targets

Agent 2 must fill exact source map. Based on codebase grep, these are the primary candidates:

### Core Diagram Components
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/components/process/BpmnStage.jsx` (~5,765 lines) | Main diagram component; viewer + modeler init, selection, decor, XML import | Initial load (ensureViewer/ensureModeler), edit mode selection path |
| `frontend/src/components/ProcessStage.jsx` (~6,626 lines) | Session shell; 70+ state values, 14+ ref-sync effects, derived model orchestration | Parent re-render churn, `selectedElementContext` memo, version polling |

### Analytics / Selection-Lite Modules
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js` | Analytics mode selection highlight | Low; already proven cheap (+238 DOM) |
| `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js` | Focus decor manager | Low in analytics mode (not called) |
| `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js` | Selection emission bridge | Low; extracted and bounded |
| `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js` | Mode state (`isDiagramAnalyticsMode`, `enterDiagramAnalyticsMode`) | Low; simple ref checks |

### Derived Model / Render Boundary
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/features/process/bpmn/stage/derived/useDiagramDerivedModel.js` | Orchestrator for derived maps | Should be stable after prior contour; verify no rebuild on selection |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js` | Element meta maps | Uses primitive version keys; should be stable |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js` | DOD/quality overlay maps | Uses `buildDraftVersionKey`; verify stability |
| `frontend/src/features/process/bpmn/stage/derived/buildInterviewDecorSignature.js` | Signature builder | Stable; used for interview decor memoization |

### Decor / Overlay Pipeline
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Decor building and viewport culling | Overlays ON cost; verify culling still works |
| `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | Overlay layout calculations | Overlays ON cost |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Fanout orchestration for settled decor | Verify no unnecessary effect runs |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Runtime event wiring | `onSelectionChanged` branches for analytics vs edit |

### Property Panel / Sidebar
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/components/NotesPanel.jsx` | Main property/sidebar panel; massive useMemo/useEffect surface (~3,200 lines) | **High candidate**: many memos depend on `selectedElementId`; panel open may trigger many recalculations |
| `frontend/src/components/sidebar/SelectedElementCard.jsx` | Selected element card | Memoized; low direct cost |
| `frontend/src/components/sidebar/SelectedNodeSection.jsx` | Selected node section | Memoized; low direct cost |
| `frontend/src/components/sidebar/ElementSettingsControls.jsx` | Element settings form | May rebuild on selection change |
| `frontend/src/components/sidebar/useElementSettingsController.js` | Settings controller | Hook stability |

### CSS / Paint
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` | Selection/hover/flash stroke styles | Some `drop-shadow` rules remain (start/end events, flash decorators, coverage decorators); may still contribute to paint cost |
| `frontend/src/styles/app/04/04-03-llm-bottlenecks.css` | Quality/bottleneck overlay styles | Remaining `drop-shadow` rules for quality glow and jump glow |
| `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` | Dark theme base | 4 `box-shadow` rules reduced; remaining context-pad/popup shadows |

### Session Shell / React Churn
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/App.jsx` | App shell; `selectedBpmnElement` state owner | `selectedBpmnElement` changes propagate to many children |
| `frontend/src/components/AppShell.jsx` | Layout shell | Re-renders on session changes |
| `frontend/src/features/process/stage/orchestration/useProcessStageLocalState.js` | Local state composition | Composes mode/action/dialog/panel state |
| `frontend/src/features/process/stage/controllers/useProcessStageShellController.js` | Shell controller | Save status, header view |

### Network / Auth
| Path | Role | Likely Residual Cost |
|------|------|---------------------|
| `frontend/src/components/ProcessStage.jsx` lines ~1534 | `pollRemoteSessionSnapshot` → `apiGetBpmnVersions(sid, { limit: 1 })` | Background poll every interval; already deduped but still present |
| `frontend/src/features/process/stage/presence/useSessionPresence.js` | Presence polling | 401 race on `/api/sessions/{id}/presence` |

## Decision Matrix Requirements

Agent 2 must produce a decision matrix with the following options:

| Option | Trigger Condition | Expected Impact | Risk | Rough Scope | Priority |
|--------|-------------------|-----------------|------|-------------|----------|
| 1. `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1` | Initial Diagram/session open is dominant bottleneck | Faster first paint; deferred non-critical work | Medium | Add skeleton, lazy hydrate decor/panel after canvas ready | High if A shows >2s to canvas |
| 2. `perf/diagram-edit-mode-lazy-enable-v1` | Analytics mode fast but edit mode remains heavy | Keep view mode default; enable editor affordances only on explicit edit | Medium | Wire explicit edit toggle; defer modeler init | High if I shows +3k DOM and visible lag |
| 3. `perf/diagram-property-panel-render-boundary-v1` | Property panel update after selection is dominant | Memoize/memo-boundary panel children; reduce recalculation | Low-Medium | Add React.memo / boundary around panel sections | High if H shows panel lag > selection lag |
| 4. `perf/diagram-large-model-progressive-rendering-v1` | Large diagram size dominates; small diagram is fine | Render visible viewport first; virtualize off-screen elements | High | Viewport-aware SVG rendering; complex | Medium if J shows large/small gap |
| 5. `research/diagram-readonly-lightweight-viewer-mode-v1` | bpmn-js Modeler baseline remains heavy even in view mode | Split viewer-only vs editor modes more strictly | Medium | Use NavigatedViewer only by default; modeler on demand | Medium if A/B show modeler init cost |
| 6. `research/diagram-alternative-renderer-canvas-webgl-fit-v1` | Evidence shows bpmn-js/SVG cannot meet target | Future-proof rendering | Very High | Research only; no implementation | Low; explicitly reject unless all other options exhausted |
| 7. `audit/processmap-test-runtime-vs-stage-performance-v1` | Test runtime/server/browser appears to be bottleneck | Isolate environment factor | Low | Compare stage vs test runtime metrics | High if subjective lag cannot be reproduced in profiling |
| 8. `STOP_DIAGRAM_PERF_MOVE_TO_PRODUCT_WORK` | Metrics acceptable; subjective lag cannot be reproduced enough | Redirect effort to Product Actions / registry / other surfaces | Low | None; document findings and close perf series | High if all objective metrics are good and lag is environment-specific |

**Final recommendation must include:**
- ONE primary next contour
- ONE backup next contour
- ONE explicitly rejected option with reason

## Expected Outputs

Agent 2 must create inside contour folder:
- `EXEC_REPORT.md`
- `POST_OPTIMIZATION_PROFILE_REPORT.md`
- `RUNTIME_EVIDENCE.md`
- `SOURCE_MAP.md`
- `RESIDUAL_BOTTLENECKS.md`
- `NEXT_CONTOUR_DECISION_MATRIX.md`
- `READY_FOR_REVIEW`

Evidence directory:
- `evidence/initial-load-timings.md`
- `evidence/tab-switch-timings.md`
- `evidence/selection-hover-timings.md`
- `evidence/pan-zoom-timings.md`
- `evidence/overlays-on-off-comparison.md`
- `evidence/edit-mode-profile.md`
- `evidence/property-panel-profile.md`
- `evidence/network-summary.md`
- `evidence/console-summary.md`
- `evidence/dom-svg-counts.md`
- `evidence/performance-trace-summary.md`
- `evidence/screenshots/`

Project Atlas mirror:
- `/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Post Optimization Runtime Profile.md`

If blocked: create `EXEC_BLOCKED.md`; do NOT create `READY_FOR_REVIEW`.

## Agent 2 Execution Plan

1. Read this PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Read previous review reports from contours 1–10 (summaries in this plan; full reports in `.planning/contours/`).
3. Run source/runtime truth commands.
4. Execute scenarios A–J where feasible using Playwright/browser.
5. Capture timings, counts, network, console, screenshots, performance trace summary.
6. Fill SOURCE_MAP.md with exact file paths, line ranges, and runtime relation.
7. Rank residual bottlenecks: confirmed / likely / possible / rejected.
8. Produce NEXT_CONTOUR_DECISION_MATRIX.md with primary + backup + rejected.
9. Do NOT change product code.
10. Create required reports and READY_FOR_REVIEW.

## Agent 3 Review Plan

1. Read all Agent 2 outputs.
2. Verify reports exist and are concrete.
3. Verify runtime evidence has timings and counts.
4. Verify source map is concrete.
5. Verify residual bottlenecks ranked with evidence.
6. Verify decision matrix is actionable.
7. Verify no product code changed, no secrets, no commit/push/PR/deploy.
8. Optional Playwright spot-check: run one initial load or pan/zoom/selection scenario.
9. If fail: create CHANGES_REQUESTED and REWORK_REQUEST.md.
10. If pass: create REVIEW_REPORT.md and REVIEW_PASS.

## Non-goals

- Do NOT write product code.
- Do NOT change frontend/backend product files.
- Do NOT make commit/push/PR.
- Do NOT deploy.
- Do NOT run RAG bootstrap.
- Do NOT run MCP repair.
- Do NOT fix GSD.
- Do NOT touch `.env` or `.env.backup_*`.
- Do NOT read or output secrets.
- Do NOT mutate durable truth.
- Do NOT mutate BPMN XML.
- Do NOT change Product Actions AI.
- Do NOT change AG-UI.
- Do NOT change RAG.
- Do NOT change backend/schema/storage.
- Do NOT add dependencies.
- Do NOT do WebGL/canvas replacement.
- Do NOT rewrite bpmn-js integration.
- Do NOT make new performance fix in this audit contour.

## Risks

1. **Playwright synthetic events may not trigger bpmn-js edit gestures** (known limitation from contour 8). Document limitation if edit mode cannot be profiled.
2. **Single session bias** (`wewe` is the only well-known test session). Document if small/large comparison is impossible.
3. **Chrome performance trace may not be feasible** in Playwright without extra setup. Document fallback.
4. **Subjective lag is hard to measure**. Agent 2 must explicitly distinguish "measured metric" from "felt lag".
5. **Pre-existing uncommitted changes** in working tree may complicate environment understanding. This contour does not modify them.

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — All previous Diagram performance contours reviewed
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Post-optimization audit scenarios defined
- [x] Gate 5 — Measurement plan defined
- [x] Gate 6 — Source map targets defined
- [x] Gate 7 — Decision matrix defined
- [x] Gate 8 — Non-goals locked
- [x] Gate 9 — Agent 2 executor prompt ready
- [x] Gate 10 — Agent 3 reviewer prompt ready
- [ ] Gate 11 — READY_FOR_EXECUTION marker created
