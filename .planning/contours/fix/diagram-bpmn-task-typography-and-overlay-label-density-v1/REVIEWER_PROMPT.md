# Reviewer Prompt — fix/diagram-bpmn-task-typography-and-overlay-label-density-v1

**Agent:** Agent 3 / Reviewer  
**Contour:** `fix/diagram-bpmn-task-typography-and-overlay-label-density-v1`  
**Run ID:** `20260516T233439Z-39228`

---

## Language Rule
- This prompt is in **English**.
- **All generated documentation, reports, and user-facing summaries must be written in Russian.**
- Preserve exact Russian UI labels when referencing ProcessMap UI.

---

## Scope
- **Independent validation.** Do not blindly trust Agent 2 reports.
- **NO** code changes.
- **NO** merge / push / PR / deploy.
- If you find issues, write `REWORK_REQUEST.md` with specific, actionable corrections.

---

## Pre-flight

1. Read `PLAN.md`, `EXEC_REPORT.md`, `STATE.json`, and all Agent 2 reports in this contour directory.

2. Run reviewer GSD checks:
   ```bash
   cd /opt/processmap-test
   command -v gsd
   command -v gsd-sdk
   test -x /opt/processmap-test/bin/gsd && echo "FOUND" || echo "MISSING"
   test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "FOUND" || echo "MISSING"
   ```

3. Run reviewer RAG preflight:
   ```bash
   node tools/rag/pm-rag-agent-preflight.mjs \
     --role reviewer \
     --contour "fix/diagram-bpmn-task-typography-and-overlay-label-density-v1" \
     --query "Diagram visual regression review rules BPMN task font-weight typography label density no performance regression" \
     --format md \
     --top-k 10
   ```
   Save to `RAG_PREFLIGHT_REVIEWER.md`.

4. Capture independent source/runtime truth:
   - `pwd`, `whoami`, `hostname`, `date -Is`
   - `git branch --show-current`, `git rev-parse HEAD`, `git status -sb`
   - `git diff --name-only`, `git diff --stat`
   - `curl -s http://clearvestnic.ru:8088/health`
   - `curl -I http://clearvestnic.ru:5180`
   - `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"`

---

## Review Checklist

### 1. Source Review

- [ ] Agent 2 changed **only** CSS files (and `appVersion.js`).
- [ ] **No** backend changes.
- [ ] **No** `package.json` / `package-lock.json` changes.
- [ ] **No** BPMN XML mutation logic changed.
- [ ] **No** Product Actions / RAG / AG-UI files modified.
- [ ] **No** `.env` or secrets touched.
- [ ] Previous performance protections (`will-change`, filter removal, overlay suppression) are **preserved**.
- [ ] Light theme CSS selectors are **not broken**.

### 2. Fresh 5180 Proof (Independent)

- [ ] `curl -I http://clearvestnic.ru:5180` → HTTP 200 OK, `Cache-Control: no-cache, no-store, must-revalidate`.
- [ ] `build-info.json` SHA matches `git rev-parse HEAD`.
- [ ] `build-info.json` `contourId` is `fix/diagram-bpmn-task-typography-and-overlay-label-density-v1`.
- [ ] `window.__PROCESSMAP_BUILD_INFO__` is valid and consistent.

### 3. Version / Marker Verification

- [ ] Footer shows **Версия v1.0.134**.
- [ ] Changelog text mentions typography fix.
- [ ] Marker is **NOT** on canvas (`document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length === 0`).

### 4. Default Task Typography (Visual Check)

- [ ] Open large Diagram session (project `wewe` if available).
- [ ] Inspect a BPMN task label (`.djs-shape` task `.djs-label`).
- [ ] Record **independent** computed styles:
  - `font-weight`
  - `font-size`
  - `fill`
  - `stroke`
  - `paint-order`
  - `text-shadow`
  - `filter`
- [ ] **Text is readable** — not too small, not invisible.
- [ ] **Text is NOT excessively bold/heavy** — it should look "calm" on the diagram, not dominate.
- [ ] Compare with Agent 2's `TASK_LABEL_COMPUTED_STYLE_ANALYSIS.md` — flag discrepancies.

### 5. Interaction State Check (Real Drag)

- [ ] Hold left mouse and pan canvas (real pointer drag, not programmatic zoom).
- [ ] `.fpcDiagramInteracting` activates correctly.
- [ ] **No white flash** — viewport filter stays `none` or stable.
- [ ] **No style jump** — task fill, stroke, and text do not change visually during pan.
- [ ] After pointerup: styles restore cleanly, no stuck class.

### 6. Overlay / Chip Density

- [ ] If overlays are ON, inspect visible chips.
- [ ] Verify chips do not look **more** aggressive than before.
- [ ] If Agent 2 changed chip CSS, verify they are still visible and usable.
- [ ] Document visual clutter assessment.

### 7. Performance Safety

- [ ] **0 PUT /bpmn** during canvas pan.
- [ ] **0 PATCH /sessions** during canvas pan.
- [ ] **0 console errors** during diagram load, pan, and interaction.
- [ ] No obvious pan smoothness regression.

### 8. Build / Tests

- [ ] Frontend build passes (or Agent 2 documented valid reason).
- [ ] No new test failures introduced by this contour.

### 9. Evidence Review

- [ ] `VISUAL_BEFORE_AFTER.md` exists and contains meaningful comparison.
- [ ] `CSS_SOURCE_MAP.md` is accurate and complete.
- [ ] `TASK_LABEL_COMPUTED_STYLE_ANALYSIS.md` shows clear before/after.
- [ ] `INTERACTION_STATE_STYLE_ANALYSIS.md` confirms stability.

---

## Verdict Rules

**REVIEW_PASS** — only if **ALL** of the following are true:
1. Source review passes (bounded scope, no violations).
2. Fresh 5180 proof is valid and independent.
3. Version v1.0.134 is visible in footer, marker NOT on canvas.
4. Default BPMN task text is **actually** less bold/heavy than v1.0.133 (verified visually, not just by number).
5. Text remains readable and not too small.
6. Task fill stays white/light, not gray.
7. No white flash during pan.
8. No style jump during/after pan.
9. Performance protections preserved.
10. Chips checked for density impact.
11. 0 PUT/PATCH during pan.
12. 0 console errors.
13. Build/tests pass.
14. **Real browser visual check was performed** — not only source review.

**REWORK_REQUEST** — if any of the following:
- Task labels still look too bold/heavy.
- Text became too small or unreadable.
- Tasks flash or change style during pan.
- Previous fill/flash regression returned.
- Performance fix was removed or regressed.
- Only source/build was checked without runtime visual verification.
- Scope violation detected.

---

## Required Outputs (in Russian)

Write in this contour directory:
1. `REVIEW_REPORT.md` — full review with verdict.
2. `RAG_PREFLIGHT_REVIEWER.md` — reviewer RAG context.
3. Independent computed style tables (can embed in REVIEW_REPORT or separate file).

If REWORK_REQUEST:
- `REWORK_REQUEST.md` with exact issues and required fixes.

---

## Final Action

- Write verdict report.
- Do NOT merge, push, or deploy.
- Do NOT start downstream agents.
