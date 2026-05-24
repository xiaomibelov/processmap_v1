# REVIEWER_PROMPT — fix/diagram-interaction-mode-visual-regression-v1

**Agent:** Agent 3 / Reviewer  
**Contour:** `fix/diagram-interaction-mode-visual-regression-v1`  
**Run ID:** 20260516T224839Z-35866  
**Language rule:** All reports, docs, and user-facing summaries must be written in **Russian**. Preserve exact Russian UI labels when referencing ProcessMap UI.

---

## 0. Pre-flight (MANDATORY)

Before starting review:

1. **Read** this `REVIEWER_PROMPT.md`, `PLAN.md`, `EXECUTOR_PROMPT.md`, `EXEC_REPORT.md`, `STATE.json`.
2. **Run reviewer RAG preflight:**
   ```bash
   cd /opt/processmap-test
   node tools/rag/pm-rag-agent-preflight.mjs \
     --role reviewer \
     --contour "fix/diagram-interaction-mode-visual-regression-v1" \
     --query "Diagram visual regression review interaction mode CSS task colors typography no performance regression" \
     --format md \
     --top-k 12
   ```
   Save to: `RAG_PREFLIGHT_REVIEWER.md`
3. **Run GSD checks:**
   ```bash
   command -v gsd
   command -v gsd-sdk
   test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
   test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
   ```
4. **Capture source/runtime truth:**
   - `pwd`, `whoami`, `hostname`, `date -Is`
   - `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
   - `git diff --name-only`, `git diff --stat`
   - `curl -s http://clearvestnic.ru:8088/health`
   - `curl -I http://clearvestnic.ru:5180`
   - `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"`
5. **Verify fresh 5180** — HTTP 200, no-cache headers.

---

## 1. Goal

Independently verify that the visual regression in BPMN task appearance is **actually fixed** in runtime, without performance regression.

---

## 2. Independent Validation

### 2.1 Fresh 5180 Proof
- Confirm `build-info.json` SHA matches `git rev-parse HEAD`.
- Confirm `window.__PROCESSMAP_BUILD_INFO__` is valid.
- Confirm version in footer is **v1.0.133** (or canonical next).
- Confirm version marker is **NOT on canvas**.

### 2.2 Default Task Visuals
- Open large diagram (`wewe` / «Описание процессов Долгопрудный»), overlays OFF.
- Inspect a **Task** element:
  - computed `fill` — should be clean white/light, NOT gray.
  - computed `stroke` — should be consistent with previous BPMN style.
  - computed `font-weight` on label — should be normal/readable, NOT overly bold.
- Take screenshot or describe visual state.

### 2.3 Interaction Mode Visuals (Canvas Pan)
- Hold left mouse on empty canvas and **pan**.
- Observe task appearance **during pan**:
  - NO white flash.
  - NO visible style jump.
  - Tasks should remain visually consistent.
- Use Playwright or browser DevTools to confirm `.fpcDiagramInteracting` is toggled.
- Record computed `filter`, `fill`, `font-weight` during interaction.

### 2.4 After Pointerup
- Release mouse button.
- Confirm style returns to stable default.
- NO lingering visual artifacts.

### 2.5 Light / Dark Theme
- If applicable, check both themes for readability.

### 2.6 Large No-Overlays Diagram
- Confirm tested on `wewe` with overlays OFF.

### 2.7 Network Safety
- Confirm **NO PUT /bpmn** during view pan.
- Confirm **NO PATCH /sessions** during view pan.

### 2.8 Console Errors
- Confirm **0 new console errors**.

---

## 3. Source Review

1. Verify bounded scope — only CSS files (and possibly `appVersion.js`) touched.
2. Verify NO backend changes.
3. Verify NO package changes.
4. Verify NO Product Actions / RAG / AG-UI changes.
5. Verify previous performance protections preserved:
   - `will-change: transform` still present.
   - Side-effect guards in `wireBpmnStageRuntimeEvents.js` untouched.
   - `diagramInteractionMode.js` logic preserved (unless explicitly justified).
   - No expensive drop-shadow filters re-added.
6. Verify `appVersion.js` bumped correctly.

---

## 4. Verdict Rules

### REVIEW_PASS allowed ONLY if ALL true:
1. GSD discipline recorded.
2. RAG review context exists.
3. Fresh 5180 proof exists.
4. Version incremented correctly.
5. Marker NOT on canvas.
6. Default task style visually corrected (no gray, no bold).
7. During pan: no white flash, no style jump.
8. After pointerup: stable.
9. Light/dark OK.
10. Large diagram tested.
11. No PUT/PATCH during view pan.
12. No console errors.
13. No scope violations.
14. Visual evidence (screenshot or detailed description) present.
15. **Real browser visual check performed** — not source-only.

### REWORK required if ANY true:
- Tasks still look gray/heavy.
- Labels remain overly bold.
- Tasks still visibly flash/change during pan.
- Performance fix blindly removed.
- Only source/build was checked, no runtime visual verification.
- Scope violation detected.

---

## 5. Required Output

Write in **Russian**:

1. `REVIEW_REPORT.md` — main review report with verdict.
2. `RAG_PREFLIGHT_REVIEWER.md` — RAG context.
3. `REVIEW_PASS` or `REWORK_REQUEST.md` — final marker.

If REVIEW_PASS:
- Create `REVIEW_PASS` file.
- Include handoff: what was reviewed, what was verified, remaining risks.

If REWORK:
- Create `REWORK_REQUEST.md` with exact issues.
- Do NOT create `REVIEW_PASS`.

---

## 6. Handoff

After verdict:
- Do NOT merge, deploy, or open PR.
- Do NOT change product code.
- Report verdict to user with:
  - contour id
  - run id
  - verdict
  - key evidence
  - risks/limitations
