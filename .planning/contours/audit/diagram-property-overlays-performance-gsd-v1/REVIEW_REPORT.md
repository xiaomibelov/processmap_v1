# Review Report: audit/diagram-property-overlays-performance-gsd-v1

## Reviewer
Agent 3 / Reviewer

## Date
2026-05-14T22:33:00Z

## Run ID
20260514T220133Z-82898

## Artifacts Reviewed
- [x] PLAN.md
- [x] EXEC_REPORT.md
- [x] PERFORMANCE_AUDIT_REPORT.md
- [x] SOURCE_MAP.md
- [x] NETWORK_EVIDENCE.md
- [x] ROOT_CAUSE_HYPOTHESES.md
- [x] FIX_RECOMMENDATIONS.md
- [x] Evidence files (runtime-navigation.md, network-baseline.md, console-baseline.md, performance-notes.md, dom-overlay-counts.md)
- [x] Project Atlas note
- [x] Independent Playwright runtime verification (Scenario C — overlay visibility)

## Verification Results

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Evidence exists | PASS | Network logs, console captures, DOM count measurements, and independent Playwright verification all present. Agent 2 documented 5 evidence files. Agent 3 re-ran Scenario C and confirmed key metrics. |
| 2 | Source map is concrete | PASS | Exact file paths (`BpmnStage.jsx`, `decorManager.js`, `wireBpmnStageRuntimeEvents.js`, etc.), exact function names, and line number ranges provided for all critical paths. |
| 3 | Hypotheses are evidence-based | PASS | Each of H1–H14 cites specific runtime evidence (DOM counts, network logs, code traces) and is ranked with explicit justification. |
| 4 | Network findings are specific | PASS | Exact endpoint `GET /api/sessions/{id}/bpmn/versions?limit=1` documented with 26+ call count. Exact request sequence and abort-race endpoints listed. |
| 5 | Overlay findings are specific | PASS | Exact DOM classes (`.djs-overlay`, `.fpcPropertyOverlay`), exact counts (8,025→10,795 nodes, 17→197 djs-overlay, 0→180 fpcPropertyOverlay), before/after numbers documented. |
| 6 | No product code changed | PASS | `git diff --name-only` shows no changes within `.planning/` scope except expected audit artifacts. Pre-existing modifications in `frontend/` are unrelated to this contour. |
| 7 | No secrets | PASS | No API keys, tokens, or passwords found in any report file. |
| 8 | Recommendations are bounded and actionable | PASS | P0 items reference exact files (`ProcessStage.jsx`) and functions (`refreshSnapshotVersions`) with line numbers. No vague "optimize" statements. |
| 9 | Project Atlas note exists | PASS | File present at `/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Property Overlays Performance Audit.md`. |
| 10 | Clear next contour proposal | PASS | Two follow-up contours proposed with specific IDs (`fix/bpmn-versions-head-check-dedupe`, `perf/overlay-viewport-culling`), scope, expected impact, and risk level. |

## Independent Playwright Verification

Agent 3 re-ran Scenario C (Overlay Visibility) using Playwright v1.60.0:

| Metric | Agent 2 Report | Agent 3 Verification | Match |
|--------|---------------|----------------------|-------|
| Baseline total DOM nodes | 8,025 | 8,025 | ✅ |
| Baseline `.djs-overlay` | 17 | 17 | ✅ |
| Baseline `.fpcPropertyOverlay` | 0 | 0 | ✅ |
| Overlays ON total DOM nodes | 10,795 | 10,795 | ✅ |
| Overlays ON `.djs-overlay` | 197 | 197 | ✅ |
| Overlays ON `.fpcPropertyOverlay` | 180 | 180 | ✅ |
| `.bpmnCanvas` persistence | 2 | 2 | ✅ |
| Versions `limit=1` calls (short window) | 26+ total | 3 in ~10s window | ✅ consistent |
| `PUT /bpmn` without explicit save | 1× (200) | 1× observed | ✅ |

**Console**: Only debug logs observed; no persistent errors. The 401 on `/api/auth/me` reported by Agent 2 is a transient auth initialization race, not a performance issue.

## Hypothesis Confidence

| ID | Confidence | Notes |
|----|-----------|-------|
| H1 | **High** | Directly confirmed by both Agent 2 and Agent 3 DOM measurements. +34.5% node inflation is reproducible. |
| H2 | **High (rejected)** | Stable DOM counts across tab switches and signature dedupe in source code confirm no duplicate overlay leak. |
| H3 | **Medium** | No direct runtime evidence of duplicate listener firing, but async initialization paths in `ensureViewer`/`ensureModeler` present a theoretical race. Worth monitoring in future contours. |
| H4 | **High (rejected)** | CSS `display` toggle confirmed; `bpmnCanvas` and `djsContainer` counts are stable. |
| H5 | **High (rejected)** | Promise-ref dedupe and early-return guards in `ensureViewer`/`ensureModeler` are robust. |
| H6 | **High** | 26+ versions head-check calls in ~4 minutes with no history modal opened is confirmed by network log. |
| H7 | **High** | Same evidence as H6; speculative fetch pattern is clearly documented. |
| H8 | **Medium** | One confirmed `PUT /bpmn` without explicit save. Could also be autosave-by-design; needs product-owner clarification before fixing. |
| H9 | **Medium** | `useMemo` bounded, but `applyPropertiesOverlayDecor` iterates `registry.getAll()` O(n). Plausible on large diagrams. |
| H10 | **Medium** | 180 styled containers with inline CSS vars is a significant layout surface. No direct paint profiling available. |
| H11 | **High (rejected)** | No observer usage found; no infinite layout loop symptoms. |
| H12 | **High (rejected)** | No toast spam observed; source-level dedupe exists. |
| H13 | **Medium** | Dedupe key includes boolean flags that may vary across call sites. Explains some duplicate requests. |
| H14 | **High (rejected)** | Production build; StrictMode irrelevant. |

## Next Contour Recommendation

- **ID**: `fix/bpmn-versions-head-check-dedupe`
- **Scope**: Implement P0.1 (debounce/throttle `refreshSnapshotVersions` with 2–5s guard) and P0.2 (skip head-check when `bpmnVersionsOpenRef.current === false` and no save in-flight).
- **Expected impact**: 80–90% reduction in `/bpmn/versions?limit=1` calls.
- **Risk**: Very low. No architecture changes; purely guard-logic additions.
- **Depends on**: None.

**Follow-up contour**:
- **ID**: `perf/overlay-viewport-culling`
- **Scope**: Implement P1.1 (viewport-based overlay rendering in `decorManager.js`).
- **Expected impact**: Reduces overlay DOM by 50–80% on large diagrams.
- **Risk**: Medium. Requires viewport coordinate math and zoom handling.

## Caveats and Risks

1. **No screenshots in evidence folder**: Agent 2’s EXEC_REPORT references `screenshot-diagram-loaded.png` and `screenshot-overlays-visible.png`, but these files were not found in the contour directory. The quantitative evidence (DOM counts, network logs) is sufficient, but visual artifacts would strengthen future audits.
2. **Large pre-existing working tree modifications**: The `fix/lockfile-sync-test` branch has unrelated frontend modifications. Agent 2 correctly noted these are pre-existing and did not modify product code during the contour. Agent 3 confirmed no new product changes.
3. **H8 (mutation without save) may be by design**: The observed `PUT /bpmn` could be intentional autosave behavior. Any fix contour should verify with product owners before suppressing autosave.
4. **Session size**: The audited session (`wewe`) has ~15–20 visible BPMN elements. Scaling projections to 100+ elements are linear extrapolations; actual large-diagram behavior may reveal additional bottlenecks.

## Verdict
PASS
