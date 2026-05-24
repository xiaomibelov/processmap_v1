# Executor Prompt — fix/diagram-bpmn-task-typography-and-overlay-label-density-v1

**Agent:** Agent 2 / Executor  
**Contour:** `fix/diagram-bpmn-task-typography-and-overlay-label-density-v1`  
**Run ID:** `20260516T233439Z-39228`

---

## Language Rule
- This prompt is in **English**.
- **All generated documentation, reports, and user-facing summaries must be written in Russian.**
- Preserve exact Russian UI labels when referencing ProcessMap UI (e.g., "Версия", "Слои OFF", "Описание процессов Долгопрудный").

---

## Scope
- **Frontend CSS-only bounded fix.**
- **NO** backend changes.
- **NO** package installation.
- **NO** Product Actions changes.
- **NO** RAG tooling changes.
- **NO** BPMN XML mutation.
- **NO** merge / push / PR / deploy.

---

## Pre-flight

1. Read `PLAN.md`, `STATE.json`, and previous contour reports:
   - `.planning/contours/fix/diagram-interaction-mode-visual-regression-v1/EXEC_REPORT.md`
   - `.planning/contours/fix/diagram-interaction-mode-visual-regression-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-interaction-mode-visual-regression-v1/CSS_SOURCE_MAP.md`

2. Run executor RAG preflight:
   ```bash
   cd /opt/processmap-test
   node tools/rag/pm-rag-agent-preflight.mjs \
     --role executor \
     --contour "fix/diagram-bpmn-task-typography-and-overlay-label-density-v1" \
     --area "Diagram BPMN task typography CSS font-weight label density" \
     --format md \
     --top-k 10
   ```
   Save to `RAG_PREFLIGHT_EXECUTOR.md`.

3. Capture source/runtime truth:
   - `pwd`, `git branch --show-current`, `git rev-parse HEAD`, `git status -sb`
   - `curl -I http://clearvestnic.ru:5180`
   - `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"`

---

## Task 1 — Baseline Visual Evidence (Before Code)

Open a **fresh** browser context on `http://clearvestnic.ru:5180/?cb=<timestamp>`.

Project: `wewe` / "Описание процессов Долгопрудный".

**A. Default task typography (normal state)**
- Inspect a visible BPMN task element (e.g., `.djs-shape[data-element-id^="Activity"] .djs-label`).
- Record **computed styles**:
  - `font-weight`
  - `font-size`
  - `fill` / `color`
  - `stroke` (if any)
  - `paint-order`
  - `text-shadow`
  - `filter`
- Screenshot the diagram.

**B. Interaction state**
- Hold left mouse and pan the canvas.
- Record computed styles for the same task label **during** pan.
- Verify `.fpcDiagramInteracting` is active on container.
- Check for any style change (fill, font-weight, filter).

**C. After pointerup**
- Record computed styles again.
- Verify stability.

**D. Overlay / chip density**
- If overlays are available (`Слои ON`), inspect visible chips.
- Record computed styles for `.fpcNodeBadge` and `.fpcPropertyRow` (if present).
- Screenshot with chips visible.

Save all baseline evidence to:
- `TYPOGRAPHY_VISUAL_BASELINE.md`
- `TASK_LABEL_COMPUTED_STYLE_ANALYSIS.md`
- `OVERLAY_CHIP_DENSITY_CHECK.md` (initial state)

---

## Task 2 — Identify Exact CSS Source

Determine **exactly** where the task label typography comes from:

1. Search frontend source for any `font-weight` rules targeting `.djs-label`, `.djs-visual text`, or task-specific selectors in:
   - `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`
   - `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`
   - `frontend/src/styles/app/06-final-structure.css`
   - `frontend/src/styles/legacy/legacy_bpmn.css`
   - Any other CSS/SCSS files in `frontend/src/styles/`

2. Check if bpmn-js sets inline `font-weight` on `<text>` elements via DevTools → Elements → inline styles.

3. Check if `paint-order: stroke fill` or `stroke` is applied to task labels (not just Pool/Lane).

4. Document the **specificity chain** and **file/line** for every relevant rule.

Save to `CSS_SOURCE_MAP.md`.

---

## Task 3 — Apply Bounded CSS Fix

**Goal:** Make BPMN task labels visually calmer (less bold/heavy) while preserving readability.

**Strategy (choose the smallest safe change):**

**Option A (preferred):** If computed style shows `font-weight: 700` or `bold` on task labels:
- Add an override in `05-02-bpmn-text-contrast.css` (or the most appropriate file) for `.bpmnCanvas .djs-shape .djs-label` and `.bpmnCanvas .djs-shape text`:
  ```css
  .bpmnCanvas .djs-shape .djs-label,
  .bpmnCanvas .djs-shape text {
    font-weight: 400 !important; /* or 500, depending on what looks calm but readable */
  }
  ```
- **Test readability in runtime before committing to the value.**

**Option B:** If the heaviness comes from `paint-order: stroke fill` or `stroke-width` on task labels:
- Remove or reduce the stroke effect on task labels specifically.
- Keep it for Pool/Lane if it helps readability there.

**Option C:** If the issue is high contrast / opacity:
- Slightly reduce `--bpmn-task-text` opacity (e.g., from `0.95` to `0.88`) in dark theme variables.
- Or add a subtle `opacity` rule to task labels.

**Option D (optional, for chips):** If chips contribute to clutter AND a safe bounded fix exists:
- `.fpcNodeBadge`: reduce `font-weight` from `700` to `600` or `650`.
- `.fpcPropertyRow`: reduce `font-weight` from `600` to `500`.
- Consider slightly reducing `box-shadow` intensity or badge opacity.
- **If any chip change causes visibility regression — revert immediately and document.**

**Constraints:**
- Do NOT touch JS files.
- Do NOT reintroduce `filter: drop-shadow(...)` on tasks.
- Do NOT change task fill or stroke (already fixed in previous contour).
- Do NOT break light theme.
- Keep `!important` usage minimal — only if bpmn-js inline styles force it.

---

## Task 4 — Preserve Previous Improvements

Ensure the following are **NOT** regressed:
- Task fill: white/light (`rgba(255,255,255,0.92)`), not gray.
- No white flash during pan.
- `will-change: transform` on viewport during interaction.
- No PUT/PATCH during view pan.
- No console errors.

If any regression is detected — fix it before proceeding.

---

## Task 5 — Version / Update Ledger

Update `frontend/src/config/appVersion.js`:
- `currentVersion`: `"v1.0.134"`
- Add new changelog entry (first in array):
  ```js
  {
    version: "v1.0.134",
    changes: [
      "Нормализована типографика лейблов BPMN-задач: уменьшен визуальный вес текста, сохранена читаемость.",
      "Проверена плотность property-чипов на диаграмме.",
      "Сохранена стабильность interaction-mode (белый flash отсутствует).",
    ],
  }
  ```

After build, verify:
- `build-info.json` has `contourId: "fix/diagram-bpmn-task-typography-and-overlay-label-density-v1"`
- `window.__PROCESSMAP_BUILD_INFO__` is valid.
- Footer shows **Версия v1.0.134**.
- Version marker is **NOT** on canvas.

---

## Task 6 — Build

```bash
cd /opt/processmap-test/frontend
npm run build
```

If build fails due to OOM, build inside Docker frontend container (see previous contours for pattern).

Verify `frontend/dist/build-info.json` is generated with correct data.

---

## Task 7 — Runtime Validation (After Code)

Open fresh 5180.

**A. Version proof**
- Footer: v1.0.134.
- build-info.json: valid.
- Marker not on canvas.

**B. Default task typography**
- Inspect same task element as in baseline.
- Record after computed styles:
  - `font-weight`, `font-size`, `fill`, `stroke`, `paint-order`, `text-shadow`, `filter`
- Screenshot.
- Verify text is readable but not heavy/bold.

**C. Interaction state**
- Pan canvas.
- Verify no style jump, no flash.
- `.fpcDiagramInteracting` stable.

**D. After pointerup**
- Stable styles.

**E. Chip density (if changed)**
- Verify chips are still visible and usable.
- Document any visual difference.

**F. Performance safety**
- 0 PUT /bpmn during pan.
- 0 PATCH /sessions during pan.
- 0 console errors.

---

## Required Reports (in Russian)

Write the following files in this contour directory:

1. `EXEC_REPORT.md` — full execution summary.
2. `RAG_PREFLIGHT_EXECUTOR.md` — RAG context used.
3. `TYPOGRAPHY_VISUAL_BASELINE.md` — before computed styles + screenshots.
4. `CSS_SOURCE_MAP.md` — exact rules/files changed and why.
5. `TASK_LABEL_COMPUTED_STYLE_ANALYSIS.md` — before/after computed style table.
6. `INTERACTION_STATE_STYLE_ANALYSIS.md` — styles during/after pan.
7. `OVERLAY_CHIP_DENSITY_CHECK.md` — chip observation before/after.
8. `VISUAL_BEFORE_AFTER.md` — screenshot comparison + description.
9. `VERSION_UPDATE_LEDGER_PROOF.md` — version proof.
10. `RUNTIME_BEFORE_AFTER.md` — runtime health before/after.
11. `IMPLEMENTATION_NOTES.md` — technical decisions and trade-offs.

---

## Final Action

- If all validation passes: create `READY_FOR_REVIEW` in this contour directory.
- If blocked: create `EXEC_BLOCKED.md` with exact reason and evidence.

**Do NOT:**
- Start Agent 3 manually.
- Ask user for permission to start review.
- Merge, push, or deploy.
