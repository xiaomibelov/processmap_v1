# perf/diagram-svg-css-repaint-reduction-v1

## GSD Discipline

- **GSD availability result**: GSD ProcessMap wrapper is available and functional.
- **Commands executed**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` (warns about missing global npm package; directs to local wrapper)
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 68 skills found
  - `find /root/.codex/agents -maxdepth 2 -type d -name 'gsd-*'` → 0 results (no agent-specific GSD dirs)
  - `/opt/processmap-test/bin/gsd` (no args) → Usage banner for `gsd-tools <command>` (state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init)
- **GSD mode used**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Confirmation**: implementation not executed.
- **Confirmation**: product files not modified.
- **Confirmation**: contour bounded to frontend-only Diagram SVG/CSS repaint and highlight styling performance reduction.
- **Confirmation**: decomposition-first rule applied if god files are touched (BpmnStage/ProcessStage must NOT be bloated; CSS changes are localized to style modules).
- **Confirmation**: Agent 2 / Agent 3 gates prepared in this PLAN.md and separate prompt files.

## Previous Evidence Source Truth

### Closed contours reviewed

1. **audit/diagram-baseline-no-overlays-canvas-profile-v1** — REVIEW_PASS
   - Baseline DOM 8,025; SVG 2,392.
   - Pan DOM delta 0.
   - Selection DOM delta +3,201 to +3,423 (before selection-lite).
   - Hypothesis H5 (CSS/SVG repaint dominates) ranked **High** confidence.

2. **feature/diagram-analytics-layer-selection-lite-decomposition-first-v1** — REVIEW_PASS
   - BpmnStage reduced by ~140 lines.
   - `selectionFocusDecor.js` and `elementSelectionEmitter.js` extracted.
   - Analytics mode selection: DOM +238, SVG +26, fpcFocusDim=0, djs-bendpoint=0, djs-segment-dragger=0.
   - Property panel works.
   - 0 PUT/PATCH from view interactions.

3. **perf/diagram-derived-maps-and-render-boundary-v1** — REVIEW_PASS after Rework Round 1
   - ProcessStage reduced by 272 lines.
   - Stable derived model modules extracted.
   - `interviewDecorSignature` uses stable prop dependency.
   - Runtime selection DOM delta +235.
   - Previous guards preserved.

### Current inference

After DOM inflation was solved by selection-lite, subjective lag remains. The next suspected layer is browser **repaint/layout/style cost**, not network, mutation, overlay DOM count, eventBus storm, or derived map churn. This matches the baseline audit’s H5 hypothesis.

## Source / Runtime Truth

| Property | Value |
|----------|-------|
| pwd | /opt/processmap-test |
| user | root |
| host | clearvestnic.ru |
| date | 2026-05-15T16:09:36+00:00 |
| git branch | fix/lockfile-sync-test |
| HEAD | a9a9d9c5f468d9da63415306da6d34dcd605aa0d |
| origin/main | d805e1c64c1107b9e3fe6854e031694bf741b187 |
| API health | `{"ok":true,"status":"ok"}` |
| Frontend | HTTP/1.1 200 OK |
| Runtime URL | http://clearvestnic.ru:5180 |
| API URL | http://clearvestnic.ru:8088 |

### Working tree notes
- Branch contains pre-existing uncommitted modifications from earlier contours (`frontend/package.json`, `frontend/package-lock.json`, `.env`, `ProcessStage.jsx`, `BpmnStage.jsx`, etc.).
- This contour MUST NOT introduce new changes outside the bounded scope.
- Any modifications must be isolated and verifiable via `git diff --name-only`.

## Problem Statement

After removal of large DOM/network/mutation/derived bottlenecks, subjective lag during Diagram interactions persists. The remaining cost is hypothesized to come from:

1. **SVG/CSS repaint**: Browser recalculates styles and paints the large SVG tree when selection/hover states change.
2. **Heavy highlight/focus CSS**: `filter: drop-shadow(...)`, `stroke-width: 2.xpx !important`, `box-shadow`, and `transition` rules in BPMN stylesheets may be expensive.
3. **bpmn-js internal selection/hover classes**: Even analytics mode’s single `fpcAnalyticsSelected` marker may cause bpmn-js to attach internal `.selected`/`.hover` classes, which then match broad descendant selectors with costly effects.
4. **Edit-mode mass dimming still exists**: `selectionFocusDecor.js` `applySelectionFocusDecor` still adds `fpcFocusDim` to **all** selectable elements in **edit mode**. While this is outside the analytics path, it is a known heavy class-toggle path if the user switches to edit mode.

**Goal**: Minimize repaint/layout/style recalculation for common interactions (selection, hover, pan, zoom, analytics highlight, property panel sync) **without** increasing DOM count, changing BPMN semantics, or redesigning the UI.

## God-file / Decomposition Risk

| File | Lines | Risk | Mitigation |
|------|-------|------|------------|
| `BpmnStage.jsx` | ~5,765 | **HIGH** — must not bloat | Do not add new logic. CSS changes only in dedicated style files. If BpmnStage must change, extract first and document. |
| `ProcessStage.jsx` | ~6,626 | **HIGH** — must not bloat | Do not modify for this contour. |
| `decorManager.js` | ~1,400+ | MEDIUM — overlay logic | Overlays are OFF in lag scenario. Do not modify unless source proof shows overlay CSS affects canvas repaint. |
| `05-02-bpmn-text-contrast.css` | ~1,400+ | LOW — already dedicated module | Safe to edit; changes must be scoped to selected/hover/high-cost states. |

**Rule**: If any change would require adding logic to BpmnStage or ProcessStage, Agent 2 must extract a bounded module first. CSS-only changes in existing `.css` files do not require extraction.

## Source Map Targets

### Candidate 1 — `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`
- **Selector/function**: Broad BPMN type selectors with `filter: drop-shadow(...)`, `stroke-width: 2.xpx !important`, `box-shadow`, `transition`, `opacity`.
- **Current role**: Provides text contrast, stroke visibility, and visual polish for BPMN elements across light/dark themes.
- **Suspected repaint cost**: **VERY HIGH**. Contains 33 `drop-shadow`, 57 `stroke-width`, 22 `box-shadow`, 4 `transition`, 238 `!important` rules. `filter: drop-shadow(...)` forces GPU filter pipeline. `stroke-width` with `!important` triggers full path repainting. Broad selectors (`.bpmnCanvas .djs-element ...`) mean any class change on any element may cause style recalculation across many rules.
- **Touches many SVG nodes?**: YES — rules apply to most shape and connection types.
- **Safe change area**: Reduce or remove `filter: drop-shadow` for selected/hover/flash states; replace with cheaper `stroke` color or simple `outline`. Reduce `stroke-width` inflation for non-critical states. Remove `transition` on SVG elements if it triggers intermediate paint frames.
- **Forbidden change area**: Do not delete the entire file. Do not remove base contrast rules that are required for readability. Do not change BPMN XML or JS logic.

### Candidate 2 — `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`
- **Selector/function**: `.bpmnStage .djs-overlay`, `.bpmnCanvas .djs-outline`, context-pad/popup `box-shadow`.
- **Current role**: Dark theme overrides for bpmn-js UI chrome and overlays.
- **Suspected repaint cost**: MEDIUM. `box-shadow: 0 8px 26px rgba(...)` on overlays can be expensive if overlays are ON. Even when overlays are OFF, `djs-outline` rules may apply to selection outlines.
- **Touches many SVG nodes?**: NO — mostly UI chrome and outline elements.
- **Safe change area**: Reduce `box-shadow` blur/spread on `djs-overlay` and context pads. Simplify `djs-outline` rules if they use expensive effects.
- **Forbidden change area**: Do not break dark theme readability. Do not remove outline visibility entirely.

### Candidate 3 — `frontend/src/styles/app/04/04-03-llm-bottlenecks.css`
- **Selector/function**: `.dodExplainability` and diagram-quality/glow/jump selectors with `filter: drop-shadow(...)` and `box-shadow: inset ...`.
- **Current role**: Visual indicators for LLM/DOD quality overlays and explainability highlights.
- **Suspected repaint cost**: MEDIUM-HIGH. `drop-shadow` filters on quality badges and jump indicators. These may apply to multiple overlay nodes simultaneously.
- **Touches many SVG nodes?**: NO — mostly overlay/badge nodes, but can be many during DOD review.
- **Safe change area**: Reduce `drop-shadow` radius/intensity. Replace with simple border/stroke where possible.
- **Forbidden change area**: Do not remove DOD visual semantics. Do not change backend DOD logic.

### Candidate 4 — `frontend/src/styles/tailwind.css`
- **Selector/function**: `.dark .bpmnCanvas .djs-outline` and various UI hover transitions.
- **Current role**: Tailwind-generated utility styles including dark-mode BPMN outline overrides.
- **Suspected repaint cost**: LOW-MEDIUM. `djs-outline` rules here are simpler than 05-02, but still part of the cascade.
- **Touches many SVG nodes?**: NO — outline elements only.
- **Safe change area**: Audit for any expensive transitions or filters on BPMN canvas descendants.
- **Forbidden change area**: Do not broad-refactor Tailwind build. Do not change unrelated UI components.

### Candidate 5 — `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`
- **Selector/function**: `applySelectionFocusDecor` → `canvas.addMarker(id, "fpcFocusDim")` for **all** selectable IDs.
- **Current role**: Edit-mode selection visual feedback (neighbors highlighted, everything else dimmed).
- **Suspected repaint cost**: **HIGH in edit mode**. Adds a class to potentially hundreds of SVG elements at once. However, this path is **NOT used in analytics mode** thanks to selection-lite.
- **Touches many SVG nodes?**: YES — mass class toggle.
- **Safe change area**: If optimizing edit mode is in scope, reduce the number of elements receiving `fpcFocusDim` or replace with a single overlay/root dimming layer. **For this contour, focus is on CSS cost, not edit-mode class count.**
- **Forbidden change area**: Do not break edit mode selection semantics. Do not remove the analytics-mode bypass.

### Candidate 6 — `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js`
- **Selector/function**: `canvas.addMarker(eid, "fpcAnalyticsSelected")` on **one** element.
- **Current role**: Analytics mode selection indicator.
- **Suspected repaint cost**: LOW in JS (single marker), but the CSS rules triggered by `.fpcAnalyticsSelected` may be expensive.
- **Touches many SVG nodes?**: NO — one element + its label.
- **Safe change area**: Ensure `.fpcAnalyticsSelected` CSS is cheap (simple stroke/fill, no drop-shadow).
- **Forbidden change area**: Do not change the marker API. Do not add more markers.

### Candidate 7 — bpmn-js internal marker classes (`djs-element selected`, `djs-element hover`)
- **Selector/function**: bpmn-js `canvas.addMarker` adds a user-supplied class, but bpmn-js itself may add internal classes or update `djs-element` state.
- **Current role**: Canvas rendering and interaction feedback.
- **Suspected repaint cost**: UNKNOWN — need runtime inspection. If bpmn-js adds `.selected` to an element, our CSS in `05-02` may match it via broad descendant selectors and apply expensive filters.
- **Touches many SVG nodes?**: NO — typically one element + label.
- **Safe change area**: Reduce CSS specificity/scope so expensive rules do not apply to bpmn-js internal states unless explicitly desired.
- **Forbidden change area**: Do not patch bpmn-js internals. Do not change marker API.

## Runtime Baseline Plan

Agent 2 must capture before/after evidence with these scenarios.

### Scenario A — Idle Diagram
1. Open runtime at `http://clearvestnic.ru:5180`.
2. Navigate to session `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`).
3. Open Diagram tab in analytics/view mode (`include_overlay=0`).
4. Record:
   - `document.querySelectorAll('*').length`
   - `document.querySelectorAll('svg *').length`
   - `document.querySelectorAll('.fpcPropertyOverlay').length`
   - `document.querySelectorAll('.djs-overlay').length`
   - `document.querySelectorAll('.fpcFocusDim').length`
   - `document.querySelectorAll('.djs-bendpoint').length`
   - `document.querySelectorAll('.djs-segment-dragger').length`
   - Console errors.
   - Network: 0 PUT `/bpmn`, 0 PATCH `/sessions`.

### Scenario B — Selection Repaint
1. Select/click 10 BPMN elements in analytics mode.
2. After each click, record:
   - DOM/SVG delta vs baseline.
   - `.fpcAnalyticsSelected` count.
   - Subjective/visual lag (document whether flicker occurs).
   - No PUT/PATCH.

### Scenario C — Hover Repaint
1. Hover 10 BPMN elements.
2. Record:
   - Whether hover causes visible flicker or lag.
   - Inspect computed styles on hovered element for expensive properties (`filter`, `box-shadow`, `stroke-width` changes).
   - No PUT/PATCH.

### Scenario D — Pan/Zoom
1. Perform 5 pan/zoom cycles.
2. Record:
   - DOM stability (counts should not drift).
   - Subjective delay.
   - Overlay/highlight alignment.

### Scenario E — Chrome Performance Trace (if feasible)
1. Capture short DevTools Performance trace around selection and hover.
2. Identify:
   - Recalculate Style duration.
   - Layout duration.
   - Paint duration.
   - Composite Layers duration.
   - Scripting duration.
3. If trace capture is not feasible via Playwright, document fallback and rely on DOM counts + computed-style inspection.

## Bounded Implementation Strategy

### Primary path — Option C: Simplify CSS effects
- Audit `05-02-bpmn-text-contrast.css` for rules that apply to selected/hover/flash states.
- Replace or reduce `filter: drop-shadow(...)` with cheaper visual feedback (e.g., `stroke` color change, simple `outline`).
- Reduce `stroke-width` !important values for highlight states.
- Remove or reduce `box-shadow` on overlay elements in `02-06-bpmn-dark-theme.css`.
- Audit `04-03-llm-bottlenecks.css` for diagram-quality `drop-shadow` rules.
- Ensure `.fpcAnalyticsSelected` CSS is minimal.

### Secondary path — Option A: Reduce mass SVG class toggles (edit mode only)
- If Agent 2 discovers that edit mode lag is also a user concern, optimize `selectionFocusDecor.js` to avoid adding `fpcFocusDim` to all elements. This is **optional** and only if it does not risk analytics mode.
- **Default**: do not touch `selectionFocusDecor.js` unless source proof explicitly requires it.

### Rejected paths
- **Option B (Cheap highlight overlay)**: Not applicable. Analytics selection already uses a single marker.
- **Option D (CSS containment)**: Too risky for bpmn-js canvas/overlays. Rejected unless Agent 2 can prove it is safe with extensive testing.
- **Option E (Throttle hover highlight)**: bpmn-js handles hover internally; throttling is not practical without touching bpmn-js internals.

### Constraints
- Do not redesign.
- Do not remove selection feedback.
- Do not touch BPMN XML.
- Prefer local CSS/selection/highlight modules.
- If touching BpmnStage/ProcessStage, extract first.

## Acceptance Criteria

Agent 3 should pass only if:

1. **Source**:
   - Repaint-heavy selectors/functions are mapped.
   - Changes are bounded to Diagram CSS/highlight/analytics selection modules.
   - No god-file bloat.

2. **Runtime**:
   - Diagram opens normally.
   - Analytics selection still works.
   - Property panel still works.
   - Hover still works.
   - Pan/zoom stable.
   - No visible highlight regression.

3. **Performance**:
   - DOM/SVG counts do not regress from selection-lite baseline (analytics selection ≤ +250 total DOM, ≤ +30 SVG).
   - No broad `fpcFocusDim` reintroduced in analytics mode.
   - No `djs-bendpoint` / `djs-segment-dragger` in analytics mode.
   - Repaint/layout evidence improved OR at minimum heavy CSS/class churn reduced with clear source proof.

4. **Network/mutation**:
   - 0 PUT `/bpmn` from view interactions.
   - 0 PATCH `/sessions` from view interactions.
   - No versions spam regression.

5. **Previous fixes preserved**:
   - Overlay viewport culling.
   - Versions dedupe.
   - Non-edit PUT guard.
   - Decor-off guard.
   - Derived maps / render boundary.
   - Selection-lite.

6. **Scope**:
   - No backend changes.
   - No package changes.
   - No BPMN XML mutation.
   - No Product Actions / RAG / AG-UI changes.

## Non-goals

- Do not replace bpmn-js.
- Do not introduce WebGL / canvas renderer.
- Do not change BPMN XML.
- Do not change backend.
- Do not change Product Actions / RAG / AG-UI.
- Do not redesign Diagram UI.
- Do not change registry / reester actions.
- Do not redo selection-lite architecture unless source proof requires a tiny local adjustment.
- Do not change edit mode semantics.
- Do not change save / version / history logic.
- Do not add dependencies.
- Do not add permanent debug logs.
- Do not optimize unrelated app surfaces.

## Agent 2 Execution Plan

Agent 2 must:

1. **Read** this PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, and previous review reports.
2. **Source-map before code**:
   - Identify which exact CSS rules in `05-02-bpmn-text-contrast.css` match selected/hover/flash states.
   - Identify which rules use `filter: drop-shadow`, `box-shadow`, `stroke-width`, `transition`.
   - Verify whether `.fpcAnalyticsSelected` has dedicated CSS and whether it triggers expensive effects.
   - Check if bpmn-js internal `.selected`/`.hover` classes compound with our CSS.
3. **Baseline before code**:
   - Run Scenarios A–E from Runtime Baseline Plan.
   - Record DOM/SVG/overlay counts.
   - Confirm network silence.
   - Capture performance trace if feasible.
4. **Implement bounded optimization**:
   - Reduce expensive CSS effects for selected/hover states.
   - Prefer simple stroke/fill changes over filters/shadows.
   - Keep behavior and visual semantics.
   - No broad refactor.
5. **Validate**:
   - Run build/tests.
   - Runtime with Playwright.
   - Before/after evidence.
   - No regressions to previous Diagram fixes.
6. **Create deliverables**:
   - `EXEC_REPORT.md`
   - `REPAINT_SOURCE_MAP.md`
   - `PERFORMANCE_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `READY_FOR_REVIEW`
   - If decomposition occurred: `DECOMPOSITION_REPORT.md`
   - If blocked: `EXEC_BLOCKED.md` and no `READY_FOR_REVIEW`.

## Agent 3 Review Plan

Agent 3 must:

1. **Read** all Agent 2 deliverables plus this PLAN.md and RUNTIME_PROOF_CHECKLIST.md.
2. **Source review**:
   - Verify CSS/SVG repaint-heavy code was addressed.
   - Verify changes are bounded.
   - Verify no god-file bloat.
   - Verify selection-lite / derived maps not regressed.
3. **Playwright runtime review**:
   - Open runtime and Diagram.
   - Run selection / hover / pan / zoom.
   - Verify property panel works.
   - Verify DOM/SVG counts stable.
   - Verify no `fpcFocusDim` mass return.
   - Verify no `djs-bendpoint` / `djs-segment-dragger` in analytics mode.
   - Verify no PUT/PATCH.
   - Verify no versions spam regression.
   - Verify overlays not regressed.
   - Verify console no new errors.
4. **Strict verdict**:
   - If any issue remains → `CHANGES_REQUESTED` + `REWORK_REQUEST.md`.
   - If pass → `REVIEW_REPORT.md` + `REVIEW_PASS`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSS change inadvertently breaks dark theme contrast | Medium | High | Test both light and dark modes. Keep readability rules intact. |
| Removing drop-shadow makes selected state invisible | Low | High | Replace with visible but cheap alternative (stroke color, outline). |
| bpmn-js internal classes rely on our CSS for visibility | Medium | Medium | Inspect bpmn-js DOM before and after. Do not remove base rules. |
| Edit mode regression if `selectionFocusDecor.js` touched | Low | High | Only touch if explicitly required and test edit mode path. |
| Playwright cannot capture precise paint timing | Medium | Low | Fallback to DOM counts + computed-style inspection + subjective lag check. |

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Previous Diagram performance evidence read
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — SVG/CSS repaint hypothesis documented
- [x] Gate 5 — Source map targets captured
- [x] Gate 6 — God-file/decomposition risk identified
- [x] Gate 7 — Bounded repaint-reduction strategy defined
- [x] Gate 8 — Acceptance criteria defined
- [x] Gate 9 — Non-goals locked
- [x] Gate 10 — Agent 2 executor prompt ready
- [x] Gate 11 — Agent 3 reviewer prompt ready
- [x] Gate 12 — READY_FOR_EXECUTION marker created
