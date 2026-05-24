# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: perf/process-stage-baseline-jank-v1
- **area/query**: Diagram performance lag
- **generated_at**: 2026-05-16T16:59:27.600Z

## Structured Facts

### Agent Rules
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.

### Contour Facts
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-visible-version-and-large-canvas-lag-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — `scripts/generate-build-info.mjs`
- **score**: 21.935
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/VERSION_UPDATE_LEDGER_PROOF.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *diagram*-drag-*lag*-gsd-review-version-ledger-rework-v1] - Changed fallback `contourId` from `fix/*diagram*-real-drag-*performance*-and-engine-decomposition-v1` to `fix/*diagram*-drag-*lag*-gsd-review-version-ledger-rework-v1`.
```

### #2 — Pre-flight
- **score**: 19.636
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *diagram*-drag-*lag*-gsd-review-version-ledger-rework-v1] 1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`. 2. Read latest contour reports: - `.planning/contours/fix/*diagram*-real-drag-*performance*-and-engine-decomposition-v1/EXEC_REPORT.md` - `.planning/contours/fix/*diagram*-real-drag-*performance*-and-engine-decomposition-v1/REVIEW_REPORT.md` - `.planning/contours/fix/*diagram*-loading-state-machine-and-canvas-controller-decomposition-v1/REVIEW_REPORT.md` - `.planning/contours/fix/*diagram*-visible-version-and-large-canvas-*lag*-v1/REVIEW_REPORT.md` - `.plann…
```

### #3 — Passing Queries
- **score**: 19.298
- **path**: `/srv/obsidian/project-atlas/ProcessMap/RAG/Search Validation Results.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: recent_14d
- **snippet**:
```
- *Diagram* REVIEW_PASS rules - Current *Diagram* *lag* bottlenecks - Agent 3 *Diagram* *performance* review
```

### #4 — Previous Drag Result / Remaining Lag
- **score**: 19.279
- **path**: `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-modeler-drag-hot-path-and-pointermove-suppression-v1] ## Previous Drag Result / Remaining *Lag*
**Previous contour**: `fix/*diagram*-drag-*lag*-gsd-review-version-ledger-rework-v1` **Status**: REVIEW_PASS achieved, but drag *lag* NOT fully solved.
```

### #5 — Diagram Property Overlays Performance — audit/diagram-property-overlays-performance-gsd-v1
- **score**: 18.969
- **path**: `/opt/processmap-test/.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/PERFORMANCE_AUDIT_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-property-overlays-*performance*-gsd-v1] ## *Diagram* Property Overlays *Performance* — audit/*diagram*-property-overlays-*performance*-gsd-v1
**Run ID**: `20260514T220133Z-82898` **Audited at**: `2026-05-14T22:07–22:21 UTC` **Auditor**: Agent 2 / Executor **Scope**: *Diagram*/BPMN rendering *performance*, property overlay behavior, network patterns, React lifecycle, DOM growth **Runtime**: Frontend `http://clearvestnic.ru:5180`, API `http://clearvestnic.ru:8088` **Test session**: `wewe` (4c515d1c6e) in project `Описание процессов Долгопрудный` (b1c8a56b6e) ---
```

## Required Gates
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Bounded scope defined in PLAN.md
- [ ] Acceptance criteria defined
- [ ] User rejection facts reviewed
- [ ] No product code written by Agent 1
- [ ] No merge/deploy/PR without explicit approval

## Warnings
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-drag-ledger-rework overrides formal REVIEW_PASS for fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ User rejection ur-synthetic-zoom-not-drag overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "Diagram performance lag" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "Diagram performance lag" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "perf/process-stage-baseline-jank-v1" --area "Diagram performance lag" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
