# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: feature/product-actions-registry-backend-view-model-hardening-v1
- **area/query**: review backend product actions registry contract planning
- **generated_at**: 2026-05-19T11:18:52.922Z

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
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)
- Which paths should be indexed? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Evidence
- **score**: 36.114
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] | # | Evidence | Path | |---|----------|------| | 1 | Dark theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/*review*-screenshot-dark.png` | | 2 | Light theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/*review*-screenshot-light.png` | ---
```

### #2 — Evidence
- **score**: 33.114
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
| # | Evidence | Path | |---|----------|------| | 1 | Dark theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/*review*-screenshot-dark.png` | | 2 | Light theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/*review*-screenshot-light.png` | ---
```

### #3 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 32.601
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX *planning* for *product* *actions* *registry* workspace analytics screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #4 — STATE
- **score**: 32.461
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/STATE.json`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] { "contour_id": "uiux/*product*-*actions*-*registry*-ia-layout-rework-v2", "status": "READY_FOR_EXECUTION", "role": "Agent 1 / Planner", "scope": "frontend UI/UX information architecture rework for *Product* *Actions* *Registry* screen", "gsd_required": true, "gsd_mode": "GSD_PROCESSMAP_WRAPPER_*PLANNING*", "agent1_*product*_code_changes_allowed": false, "agent2_frontend_ui_changes_allowed": true, "*backend*_changes_allowed": false, "bpmn_xml_mutation_allowed": false, "durable_truth_mutation_allowed": false, "ag_ui_integration_allowed": false, "rag_changes…
```

### #5 — Active Related Contours (from .planning/contours)
- **score**: 31.852
- **path**: `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-ai-ag-ui-protocol-fit-v1] ## Active Related Contours (from .*planning*/contours)
- `tooling/mcp-servers-inventory-and-repair-v1` — READY_FOR_EXECUTION - `tooling/processmap-agent3-ui-*review*-skill-binding-v1` — *REVIEW*_PASS - `tooling/project-atlas-server-docs-import-and-triage-v1` — READY_FOR_EXECUTION - `tooling/project-atlas-sync-and-rag-bootstrap-v1` — READY_FOR_EXECUTION - `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` — READY_FOR_EXECUTION, READY_FOR_*REVIEW*, *REVIEW*_PASS **IMPORTANT**: This contour must NOT mix with: - `uiux/*product*-*actions*-*registry*-workspa…
```

### #6 — REVIEW_REPORT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 31.047
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *REVIEW*_REPORT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 3 / *Review*er > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Run ID:** `20260514T194022Z-72528` > **Date:** 2026-05-14 > **Verdict:** *REVIEW*_PASS ---
```

### #7 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 30.601
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX *planning* for *product* *actions* *registry* workspace analytics screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #8 — REVIEWER_PROMPT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 29.760
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *REVIEW*ER_PROMPT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 3 / *Review*er > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Scope:** Playwright-based UI/UX *review* of *Product* *Actions* *Registry* screen ---
```

### #9 — Inside Contour
- **score**: 29.147
- **path**: `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-ai-ag-ui-protocol-fit-v1] 5. `/opt/processmap-test/.*planning*/contours/research/*product*-*actions*-ai-ag-ui-protocol-fit-v1/EXEC_REPORT.md` 6. `/opt/processmap-test/.*planning*/contours/research/*product*-*actions*-ai-ag-ui-protocol-fit-v1/READY_FOR_*REVIEW*` (only if all requirements met)
```

### #10 — REVIEW_REPORT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 29.047
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## *REVIEW*_REPORT — uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 3 / *Review*er > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Run ID:** `20260514T194022Z-72528` > **Date:** 2026-05-14 > **Verdict:** *REVIEW*_PASS ---
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
node tools/rag/pm-rag-search.mjs "review backend product actions registry contract planning" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "review backend product actions registry contract planning" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "feature/product-actions-registry-backend-view-model-hardening-v1" --area "review backend product actions registry contract planning" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
