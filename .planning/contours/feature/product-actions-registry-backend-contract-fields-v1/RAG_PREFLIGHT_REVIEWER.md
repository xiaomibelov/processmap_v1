# Run ID: `20260519T133919Z-32264`

# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: feature/product-actions-registry-backend-contract-fields-v1
- **area/query**: review product actions registry backend contract fields
- **generated_at**: 2026-05-19T12:34:33.486Z

## Structured Facts

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)

### User Rejections
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)
- Which paths should be indexed? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — REVIEW_REPORT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 31.047
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *REVIEW*_REPORT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 3 / *Review*er > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Run ID:** `20260514T194022Z-72528` > **Date:** 2026-05-14 > **Verdict:** *REVIEW*_PASS ---
```

### #2 — 6. Product Actions Draft/Durable Contract
- **score**: 29.849
- **path**: `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-ai-ag-ui-protocol-fit-v1] ## 6. *Product* *Actions* Draft/Durable *Contract*
Propose candidate event/state *contract*: - Draft state location - Durable accepted state location - Event list (see PLAN.md for minimum events) - For each event: purpose, payload *fields*, durable or ephemeral, safe to log yes/no, UI behavior
```

### #3 — REVIEWER_PROMPT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 29.760
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *REVIEW*ER_PROMPT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 3 / *Review*er > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Scope:** Playwright-based UI/UX *review* of *Product* *Actions* *Registry* screen ---
```

### #4 — Source truth
- **score**: 28.884
- **path**: `/opt/processmap-test/PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md`
- **source/category**: handoff-notes / docs
- **why_matched**: path_match, recent_14d
- **snippet**:
```
| Area | Source | | --- | --- | | *Product* *actions* durable truth | `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md` | | AI module architecture | `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md` | | *Registry* UI surface | `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md` | | Session-level AI stabilization | `PROCESSMAP/HANDOFF/2026-05-07 - fix *product* *actions* ai suggest session *review* v1.md` | | *Registry* session summary consistency | `PROCESSMAP/HANDOFF/2026-05-07 - fix *product* *actions* *registry* workspace session summary consistency v1.md` | | *Backend* *registry* aggregation | `PROCES
```

### #5 — Evidence
- **score**: 28.706
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] | # | Evidence | Path | |---|----------|------| | 1 | Dark theme full-page screenshot | `.planning/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/*review*-screenshot-dark.png` | | 2 | Light theme full-page screenshot | `.planning/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/*review*-screenshot-light.png` | ---
```

## Required Gates
- [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [ ] Fresh runtime proof collected (5180/8088)
- [ ] Exact user scenario reproduced
- [ ] Before/after evidence collected
- [ ] User rejection override checked
- [ ] No REVIEW_PASS if user-visible scenario still fails
- [ ] Product runtime unchanged without scope

## Warnings
- ⚠️ User rejection ur-fix-drag-ledger-rework overrides formal REVIEW_PASS for fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ User rejection ur-synthetic-zoom-not-drag overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "review product actions registry backend contract fields" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "review product actions registry backend contract fields" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "feature/product-actions-registry-backend-contract-fields-v1" --area "review product actions registry backend contract fields" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
