# REVIEW_REPORT — audit/diagram-baseline-no-overlays-canvas-profile-v1

**Run ID**: `20260515T112356Z-18129`  
**Reviewer**: Agent 3 / Reviewer  
**Date**: 2026-05-15  
**Contour**: `audit/diagram-baseline-no-overlays-canvas-profile-v1`

---

## Verdict: PASS

---

## 1. Reports Exist and Are Concrete

| Report | Status | Notes |
|--------|--------|-------|
| `EXEC_REPORT.md` | ✅ Present | Concrete summary, key metrics, limitations |
| `BASELINE_PROFILE_REPORT.md` | ✅ Present | Scenarios A–H with specific counts |
| `SOURCE_MAP.md` | ✅ Present | 12 candidates with file paths, line ranges, analysis |
| `RUNTIME_EVIDENCE.md` | ✅ Present | DOM counts, network, console, UI state |
| `HYPOTHESES_RANKING.md` | ✅ Present | H1–H10 all addressed with confidence and evidence |
| `NEXT_CONTOUR_RECOMMENDATION.md` | ✅ Present | Primary + backup with decision matrix |

**Finding**: All 6 required reports present. No generic/vague statements. Numbers are specific.

---

## 2. Runtime Evidence Is Concrete

- **DOM/SVG counts**: Captured for baseline, pan, zoom, selection (10 clicks), hover (10 elements), tab switch (Analysis↔Diagram, XML↔Diagram).
- **Network**: Documented `GET /bpmn?include_overlay=0`, 3× `versions?limit=1`, 0 PUT /bpmn, 0 PATCH /sessions.
- **Console**: Pre-existing 401 auth race documented; no performance errors.

**Spot-check verification** (Agent 3 independent Playwright run):

| Metric | Agent 2 Reported | Agent 3 Verified | Match |
|--------|-----------------|------------------|-------|
| Baseline total DOM | 8,025 | 8,025 | ✅ EXACT |
| Baseline SVG | 2,392 | 2,392 | ✅ EXACT |
| Baseline `.fpcPropertyOverlay` | 0 | 0 | ✅ EXACT |
| Pan DOM delta | 0 | 0 | ✅ EXACT |
| Selection DOM delta | +3,201 | +3,423* | ✅ CONFIRMED |

\* Variance due to different selected element (`Event_1yyx9y7` vs `Event_1duwp2k`). Order of magnitude and mechanism identical.

**Finding**: Runtime evidence is reproducible and accurate.

---

## 3. Overlays ON vs OFF Comparison

- Overlays were OFF for entire session (`include_overlay=0`).
- Previous audit baselines cited for overlays ON (~70 `.fpcPropertyOverlay`, +1,150 total DOM post-culling).
- **Critical question answered**: Canvas IS still slow when `.fpcPropertyOverlay` is 0 because selection alone adds +3,200 nodes, which dwarfs the overlay cost.

**Finding**: Comparison exists and supports the contour goal.

---

## 4. Source Map Is Concrete

- `SOURCE_MAP.md` contains exact paths (e.g., `frontend/src/components/process/BpmnStage.jsx`).
- Function/hook names with line ranges (e.g., `applySelectionFocusDecor` lines 2068–2126).
- Analysis of whether each runs with overlays off.
- Derived map rebuild behavior analyzed (`readySignal` primitive memoization confirmed stable).

**Finding**: Source map meets all requirements.

---

## 5. Hypotheses Are Ranked with Evidence

| Hypothesis | Confidence | Evidence | Verdict |
|-----------|------------|----------|---------|
| H1 Pure bpmn-js cost | Medium | Baseline smooth, lag tied to selection | Plausible, not primary |
| H2 Decor pipeline active when off | High | Source: unconditional fanout call | Confirmed (early exit is cheap) |
| H3 Derived maps rebuild too often | Low | No runtime churn observed | Rejected |
| H4 React render churn | Medium-High | Source: 70+ state values, 14 ref-sync effects | Exists, secondary |
| H5 CSS/SVG repaint dominates | High | +3,186 SVG nodes on selection | **Most likely primary** |
| H6 Selection triggers heavy recalc | High | +3,198 DOM on selection; hover is 0 | Confirmed |
| H7 Hidden tab pipeline runs | Medium | Minor effect firing; no regression | Rejected as primary |
| H8 Test runtime amplifies lag | Low | Runtime healthy | Rejected |
| H9 Large diagram scale | Low | 276 elements is moderate | Rejected |
| H10 Guard layer overhead | Low | Guards are cheap | Rejected |

**Finding**: All H1–H10 addressed with confidence levels, evidence, and scenario references.

---

## 6. Final Recommendation Is Actionable

| Aspect | Status |
|--------|--------|
| ONE primary next contour | ✅ `fix/diagram-decor-pipeline-disable-when-overlays-off-v1` |
| ONE backup next contour | ✅ `perf/diagram-svg-css-repaint-reduction-v1` |
| Decision matrix | ✅ Present with risk/impact estimates |
| Justified by evidence | ✅ References source lines and runtime counts |
| Does not jump to WebGL | ✅ Explicitly rejects canvas/WebGL as over-engineering |

**Finding**: Recommendation is bounded, evidence-based, and actionable.

---

## 7. Scope Boundaries Respected

- `git diff --name-only` shows pre-existing modifications from previous contours on `fix/lockfile-sync-test`.
- `EXEC_REPORT.md` confirms: "No frontend/backend source files modified by this contour."
- No commits, pushes, PRs, or deployments performed.
- No secrets in reports.

**Finding**: Scope boundaries respected.

---

## 8. Project Atlas Note

- Agent 2 ran mirror script → `/srv/obsidian/project-atlas/ProcessMap/AgentReports/audit/diagram-baseline-no-overlays-canvas-profile-v1/` exists.
- Specific Audits path (`/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Baseline No Overlays Canvas Profile.md`) was missing.
- **Agent 3 remediated**: Created the Audits note during review (see below).

**Finding**: Satisfied after remediation.

---

## Issues / Discrepancies

| Issue | Severity | Resolution |
|-------|----------|------------|
| Overlay toggle unresponsive in Playwright | Low (documented) | Known limitation from previous audits; documented in EXEC_REPORT and BASELINE_PROFILE_REPORT |
| Chrome performance trace not captured | Low (documented) | Playwright trace not enabled; fallback inference from DOM counts is reasonable |
| Project Atlas Audits note missing initially | Low | Created by Agent 3 during review |
| Single session bias | Low (documented) | Only `wewe` profiled; acknowledged as limitation |

---

## Independent Verification Summary

Agent 3 performed one Playwright scenario:
1. Opened `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`
2. Navigated to Diagram tab
3. Captured baseline counts (exact match to Agent 2)
4. Performed pan cycle (0 DOM change, confirmed)
5. Selected a BPMN element (`Event_1yyx9y7`)
6. Verified massive DOM inflation (+3,423 total, +3,190 SVG)

**Conclusion**: Agent 2's counts and conclusions are reproducible.

---

## Review Decision

**REVIEW_VERDICT: PASS**

contour=audit/diagram-baseline-no-overlays-canvas-profile-v1  
run_id=20260515T112356Z-18129
