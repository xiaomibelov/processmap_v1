# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: uiux/product-actions-registry-noise-cleanup-single-container-v1
- **area/query**: product actions registry visual acceptance criteria
- **generated_at**: 2026-05-18T17:01:36.773Z

## Structured Facts

### Agent Rules
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)

### User Rejections
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)

### Validation Facts
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — E. Main product actions registry table
- **score**: 29.124
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## E. Main *product* *actions* *registry* table
- Primary *visual* object. - Table with columns: Продукт, Действие, Процесс/шаг, Статус. - High density, paint-only hover. - If 0 rows: contextual empty state **inside** the table area (not a separate block).
```

### #2 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 26.643
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX planning for *product* *actions* *registry* workspace analytics screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #3 — Runtime URL
- **score**: 26.408
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] - Frontend: `http://clearvestnic.ru:5180` - Route: `?surface=*product*-*actions*-*registry*&scope=workspace` Agent 3 Playwright review is required to validate: - No visible "workspace/frontend/scope" in user-facing UI - Correct DOM order and *visual* hierarchy - Light/dark readability - No horizontal scrollbar at 1280px+ - No console/network errors on *registry* screen
```

### #4 — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 26.386
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX information architecture rework for *Product* *Actions* *Registry* screen > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Date:** 2026-05-14 > **Run ID:** `20260514T194022Z-72528` > **Status:** READY_FOR_EXECUTION ---
```

### #5 — Runtime Navigation — Product Actions Registry
- **score**: 26.315
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## Runtime Navigation — *Product* *Actions* *Registry*
> **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Purpose:** How to reach and inspect the target surface at runtime. ---
```

### #6 — E. Main product actions registry table
- **score**: 26.124
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-ia-layout-rework-v2/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## E. Main *product* *actions* *registry* table
- Primary *visual* object. - Table with columns: Продукт, Действие, Процесс/шаг, Статус. - High density, paint-only hover. - If 0 rows: contextual empty state **inside** the table area (not a separate block).
```

### #7 — 1. GSD / source truth
- **score**: 25.963
- **path**: `/opt/processmap-test/docs/specs/product-actions-registry-and-export-mvp-spec-v1.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match, recent_14d
- **snippet**:
```
| Поле | Значение | | --- | --- | | GSD CLI | `GSD_UNAVAILABLE`: `gsd` не найден | | GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route query unsupported | | Route | `GSD_FALLBACK_MANUAL_SPEC_AND_SOURCE_MAP` | | Worktree | `/tmp/processmap_*product*_*actions*_*registry*_spec_v1` | | Branch | `feature/*product*-*actions*-*registry*-and-export-mvp-spec-v1` | | HEAD / origin/main / merge-base | `74e6e68bce74a054ab90d55b65d9d8ba8e19e21f` | | Base | clean worktree from `origin/main` | | *Product* code | не менялся | Ambiguity score after source map: | Dimension | Score | Gate | | ---
```

### #8 — UX Problem Statement
- **score**: 25.821
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] Current *registry* screen suffers from: 1. **Identity crisis** — looks like a temporary debug/export preview, not a workspace analytics *registry*. 2. ***Visual* noise** — dashed workspace notice, scattered empty states, card-like summary pills. 3. **Navigation confusion** — "Проекты" button active on the very screen it would navigate away from. 4. **Filter overload** — 7 dropdowns in a grid eat horizontal space. 5. **Density issues** — too much padding and cardification for what should be a dense operational table. 6. **Dark theme heavine…
```

### #9 — Executor Report — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 25.416
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## Executor Report — uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Role:** Agent 2 / Executor > **Execution Run ID:** `20260514T160603Z-49874` > **Date:** 2026-05-14 ---
```

### #10 — REVIEW_REPORT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 25.246
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## REVIEW_REPORT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 3 / Reviewer > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Run ID:** `20260514T194022Z-72528` > **Date:** 2026-05-14 > **Verdict:** REVIEW_PASS ---
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
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ User rejection ur-synthetic-zoom-not-drag overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "product actions registry visual acceptance criteria" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "product actions registry visual acceptance criteria" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "uiux/product-actions-registry-noise-cleanup-single-container-v1" --area "product actions registry visual acceptance criteria" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
