# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: feature/process-analytics-hub-and-registry-navigation-v1
- **area/query**: Analytics Hub review rules Product Actions Registry not top-level Properties Registry placeholder 4-agent workflow independent workers no false worker dependency
- **generated_at**: 2026-05-17T08:45:50.389Z

## Structured Facts

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### User Rejections
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).

### Contour Facts
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)

### Bottlenecks
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — Your mission
- **score**: 39.681
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] Redesign the UI/UX of the ProcessMap ***product* *actions* *registry*** screen so it feels like a professional workspace-*level* *analytics* *registry*, **no*t* a temporary debug page. ---
```

### #2 — UX Problem Statement
- **score**: 38.048
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] Current *registry* screen suffers from: 1. **Identity crisis** — looks like a temporary debug/export p*review*, **no*t* a workspace *analytics* *registry*. 2. **Visual *no*ise** — dashed workspace **no*t*ice, scattered empty states, card-like summary pills. 3. **Navigation confusion** — "Проекты" button active on the very screen it would navigate away from. 4. **Filter overload** — 7 dropdowns in a grid eat horizontal space. 5. **Density issues** — too much padding and cardification for what should be a dense operational table. 6. **Dark theme heavine…
```

### #3 — Runtime Proof Checklist — Agent 3
- **score**: 37.849
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## Runtime Proof Checklist — *Agent* 3
> **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Target surface:** *Product* *actions* *registry* / workspace *analytics* screen > **URL:** `http://clearvestnic.ru:5180/app?surface=*product*-*actions*-*registry*` ---
```

### #4 — Your mission
- **score**: 37.181
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
Redesign the UI/UX of the ProcessMap ***product* *actions* *registry*** screen so it feels like a professional workspace-*level* *analytics* *registry*, **no*t* a temporary debug page. ---
```

### #5 — Agent 3 review checks (Playwright)
- **score**: 37.087
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *Agent* 3 *review* checks (Playwright)
- [ ] *Agent* 3 Playwright *review* required - [ ] *No* visible "workspace" in user-facing UI - [ ] *No* visible "frontend" in user-facing UI - [ ] *No* visible "scope" in user-facing UI - [ ] *No* "Сессии workspace" - [ ] "Проекты" hidden/**no*t* clickable on *registry* route - [ ] "Вернуться" secondary/passive - [ ] Main object is *product* *actions* *registry*, **no*t* session list - [ ] Source sessions are secondary/collapsible/compact - [ ] Summary metrics before filters/table - [ ] Filters are one compact toolbar - [ ] AI …
```

### #6 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 36.865
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** *Agent* 1 / Planner > **Scope:** Frontend UI/UX planning for *product* *actions* *registry* workspace *analytics* screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #7 — Agent 3 — Reviewer Prompt
- **score**: 36.573
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## *Agent* 3 — *Review*er Prompt
> **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Scope:** UI/UX *review* of *product* *actions* *registry* screen > **Role:** *Agent* 3 / *Review*er ---
```

### #8 — Source truth
- **score**: 36.290
- **path**: `/opt/processmap-test/PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md`
- **source/category**: handoff-notes / docs
- **why_matched**: path_match, recent_14d
- **snippet**:
```
| Area | Source | | --- | --- | | *Product* *actions* durable truth | `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md` | | AI module architecture | `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md` | | *Registry* UI surface | `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md` | | Session-*level* AI stabilization | `PROCESSMAP/HANDOFF/2026-05-07 - fix *product* *actions* ai suggest session *review* v1.md` | | *Registry* session summary consistency | `PROCESSMAP/HANDOFF/2026-05-07 - fix *product* *actions* *registry* workspace session summary consistency v1.md` | | Backend *registry* aggregation | `PROCES
```

### #9 — REVIEWER_PROMPT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 35.869
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *REVIEW*ER_PROMPT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** *Agent* 3 / *Review*er > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Scope:** Playwright-based UI/UX *review* of *Product* *Actions* *Registry* screen ---
```

### #10 — Runtime Proof Checklist — Agent 3
- **score**: 35.849
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## Runtime Proof Checklist — *Agent* 3
> **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Target surface:** *Product* *actions* *registry* / workspace *analytics* screen > **URL:** `http://clearvestnic.ru:5180/app?surface=*product*-*actions*-*registry*` ---
```

### #11 — UX Problem Statement
- **score**: 35.548
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
Current *registry* screen suffers from: 1. **Identity crisis** — looks like a temporary debug/export p*review*, **no*t* a workspace *analytics* *registry*. 2. **Visual *no*ise** — dashed workspace **no*t*ice, scattered empty states, card-like summary pills. 3. **Navigation confusion** — "Проекты" button active on the very screen it would navigate away from. 4. **Filter overload** — 7 dropdowns in a grid eat horizontal space. 5. **Density issues** — too much padding and cardification for what should be a dense operational table. 6. **Dark theme heaviness** — layered translucent backgrounds create visual mud. **P
```

### #12 — REVIEW_REPORT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 35.125
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *REVIEW*_REPORT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** *Agent* 3 / *Review*er > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Run ID:** `20260514T194022Z-72528` > **Date:** 2026-05-14 > **Verdict:** *REVIEW*_PASS ---
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
node tools/rag/pm-rag-search.mjs "feature/process-analytics-hub-and-registry-navigation-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "feature/process-analytics-hub-and-registry-navigation-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "feature/process-analytics-hub-and-registry-navigation-v1" --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
