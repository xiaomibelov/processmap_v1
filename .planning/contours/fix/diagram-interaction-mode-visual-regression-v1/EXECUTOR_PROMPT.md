# EXECUTOR_PROMPT — fix/diagram-interaction-mode-visual-regression-v1

**Agent:** Agent 2 / Executor  
**Contour:** `fix/diagram-interaction-mode-visual-regression-v1`  
**Run ID:** 20260516T224839Z-35866  
**Language rule:** All reports, docs, and user-facing summaries must be written in **Russian**. Preserve exact Russian UI labels when referencing ProcessMap UI.

---

## 0. Pre-flight (MANDATORY)

Before writing any product code:

1. **Read** this `EXECUTOR_PROMPT.md`, `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
2. **Run executor RAG preflight:**
   ```bash
   cd /opt/processmap-test
   node tools/rag/pm-rag-agent-preflight.mjs \
     --role executor \
     --contour "fix/diagram-interaction-mode-visual-regression-v1" \
     --area "Diagram interaction mode CSS task fill gray bold typography white during pan drag BPMN visual fix" \
     --format md \
     --top-k 12
   ```
   Save to: `RAG_PREFLIGHT_EXECUTOR.md`
3. **Capture source/runtime truth:**
   - `pwd`, `whoami`, `hostname`, `date -Is`
   - `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
   - `git diff --name-only`, `git diff --stat`
   - `curl -s http://clearvestnic.ru:8088/health`
   - `curl -I http://clearvestnic.ru:5180`
   - `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"`
4. **Verify fresh 5180** is serving the current branch.

---

## 1. Goal

Fix the visual regression in BPMN task appearance caused by the previous `perf/diagram-human-perceived-pan-and-drag-smoothness-v1` contour's CSS interaction-mode rules, **without** re-introducing lag.

---

## 2. Reproduce the Visual Regression

1. Open `http://clearvestnic.ru:5180/?cb=<timestamp>` in a fresh browser context.
2. Navigate to project `wewe` / «Описание процессов Долгопрудный».
3. Turn **overlays OFF** (`window.fpcPropertyOverlay = 0`).
4. Inspect a **Task** element in default state:
   - computed `fill` on `.djs-visual rect`
   - computed `stroke`
   - computed `font-weight` on task label `<text>`
   - computed `filter` on `.viewport`
5. **Before screenshots:** capture the default task appearance.
6. Hold left mouse button on empty canvas and **pan**:
   - observe `.fpcDiagramInteracting` gets added to `.djs-container`
   - observe task appearance change (white flash?)
   - capture computed styles during pan
7. **After pointerup:** capture computed styles again.

Document everything in `VISUAL_REGRESSION_BASELINE.md` and `INTERACTION_MODE_STYLE_ANALYSIS.md`.

---

## 3. Identify Source of Visual Regression

**Likely source areas (in priority order):**

1. `frontend/src/styles/legacy/legacy_bpmn.css`
   - Look for `.bpmnCanvas .djs-container .viewport { filter: ... }`
   - This `brightness(.88) contrast(.96)` makes tasks look gray.

2. `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`
   - Look for `.fpcDiagramInteracting .djs-visual * { shape-rendering: crispEdges !important; }`
   - This may affect text weight / sharpness.
   - Look for dark-theme overrides that change task fill/stroke in interaction mode.

3. `frontend/src/styles/app/06-final-structure.css`
   - Look for `.fpcDiagramInteracting .bpmnCanvas .djs-container .viewport { filter: none; will-change: transform; }`
   - The `filter: none` causes the white flash during pan.

4. `frontend/src/features/process/bpmn/stage/interaction/diagramInteractionMode.js`
   - Verify the toggle logic is correct (it probably is; do not change unless necessary).

5. `frontend/src/config/appVersion.js`
   - Version bump target.

**Output:** `CSS_SOURCE_MAP.md` with exact selectors, file paths, line numbers, and proposed fixes.

---

## 4. Hypotheses to Test

| ID | Hypothesis | How to verify |
|----|-----------|---------------|
| H1 | Base `filter: brightness(.88) contrast(.96)` is the source of gray task fill. | Remove/disable the rule temporarily and observe task color. |
| H2 | `shape-rendering: crispEdges !important` makes text look too bold/heavy. | Remove/disable the rule temporarily and observe text. |
| H3 | `filter: none` during `.fpcDiagramInteracting` causes white flash. | Replace `filter: none` with a less drastic override (e.g., weaker filter or preserve dark-theme tint). |
| H4 | The fix can be CSS-only. | Attempt CSS changes first; if insufficient, document why JS change is needed. |
| H5 | Light vs dark theme behave differently. | Test both themes. |

---

## 5. Bounded Fix Strategy

**Priority: CSS-only.**

### Option A (Preferred): Adjust base filter and interaction override
- **Do NOT** remove interaction-mode optimization entirely.
- **Do NOT** re-add expensive drop-shadow filters.
- Adjust the base `filter` so tasks do not look gray in normal state.
- Adjust the interaction override so there is no visible white flash.
- Example directions:
  - Reduce `brightness` / `contrast` values closer to `1.0`.
  - Or remove the base filter entirely if it was only for dark-theme tint and replace with per-element fill/stroke rules.
  - Or replace `filter: none` with a gentler `filter` that still reduces paint cost (e.g., `filter: opacity(1)` or a very light adjustment).

### Option B: Remove `shape-rendering: crispEdges !important` if it causes bold text
- If confirmed, remove or replace with `shape-rendering: auto` for text elements.
- Keep for shapes (paths/rects) if it helps performance.

### Option C: Scope `.fpcDiagramInteracting` more narrowly
- If the class is applied too broadly, scope it to canvas pan only (but this is JS change — last resort).

**Out of scope:**
- Do NOT touch `wireBpmnStageRuntimeEvents.js` side-effect guards.
- Do NOT touch `diagramInteractionMode.js` unless absolutely necessary.
- Do NOT change backend.
- Do NOT install packages.
- Do NOT change Product Actions / RAG / AG-UI.

---

## 6. Version Update

- File: `frontend/src/config/appVersion.js`
- Bump: `v1.0.132` → `v1.0.133`
- Changelog entry (Russian): «Исправлена визуальная регрессия BPMN-задач: восстановлен чистый стиль fill/stroke/текста, убран белый flash при pan/drag.»
- Ensure `build-info.json` is generated after build.
- Ensure `window.__PROCESSMAP_BUILD_INFO__` matches.

---

## 7. Validation

### After code changes:
1. Rebuild frontend (use Docker container if host OOMs).
2. Verify 5180 serves fresh assets.
3. Re-run the reproduction steps from Section 2.
4. Capture **after** screenshots and computed styles.
5. Compare before/after in `VISUAL_BEFORE_AFTER.md`.

### Checklist:
- [ ] Default task fill is clean white/light (not gray).
- [ ] Default task text is readable (not overly bold).
- [ ] During canvas pan: no white flash, no visible style jump.
- [ ] After pointerup: style remains stable.
- [ ] Light theme OK.
- [ ] Dark theme OK.
- [ ] Large no-overlays diagram OK.
- [ ] No PUT/PATCH during view pan.
- [ ] No console errors.
- [ ] Build passes.
- [ ] Version v1.0.133 visible in footer.
- [ ] Marker NOT on canvas.

---

## 8. Required Reports

Write all reports in **Russian**:

1. `EXEC_REPORT.md` — main execution report.
2. `RAG_PREFLIGHT_EXECUTOR.md` — RAG context.
3. `VISUAL_REGRESSION_BASELINE.md` — before evidence (screenshots + computed styles).
4. `CSS_SOURCE_MAP.md` — exact selectors and proposed fixes.
5. `INTERACTION_MODE_STYLE_ANALYSIS.md` — computed style analysis normal / interacting / after.
6. `VISUAL_BEFORE_AFTER.md` — comparison.
7. `VERSION_UPDATE_LEDGER_PROOF.md` — version proof.
8. `RUNTIME_BEFORE_AFTER.md` — runtime state proof.
9. `IMPLEMENTATION_NOTES.md` — what was changed and why.
10. `READY_FOR_REVIEW` or `EXEC_BLOCKED.md` — final marker.

---

## 9. Handoff

After all reports are written and validation passes:
- Create `READY_FOR_REVIEW` file.
- Do NOT start Agent 3 manually.
- Agent 3 starts automatically when `READY_FOR_REVIEW` exists.

If blocked:
- Create `EXEC_BLOCKED.md` with exact reason.
- Do NOT create `READY_FOR_REVIEW`.
