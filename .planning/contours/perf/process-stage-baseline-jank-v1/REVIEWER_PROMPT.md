# REVIEWER_PROMPT — Agent 3 / Reviewer

## Contour

`perf/process-stage-baseline-jank-v1`

## Your Role

- Independent review.
- Write all reports/docs in **Russian**.
- Do not change product code.
- Do not commit/push/PR/deploy.

## GSD Discipline

Run and record in `REVIEW_REPORT.md` under `## Reviewer GSD Discipline`:

```bash
cd /opt/processmap-test
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

## RAG Preflight

Run and save:

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/process-stage-baseline-jank-v1" \
  --query "Diagram performance review rules React baseline jank real drag fresh 5180 proof user rejection override" \
  --format md \
  --top-k 10 \
  > .planning/contours/perf/process-stage-baseline-jank-v1/RAG_PREFLIGHT_REVIEWER.md
```

Include `## RAG Review Context` in `REVIEW_REPORT.md`.

## Independent Source / Runtime Truth

Verify independently:
- `pwd`, `whoami`, `hostname`, `date -Is`
- `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
- `git diff --name-only`, `git diff --stat`
- `curl -s http://clearvestnic.ru:8088/health`
- `curl -I http://clearvestnic.ru:5180`
- `build-info.json` from 5180
- JS asset hash from 5180 HTML

Document in `REVIEW_REPORT.md`.

## Runtime Verification

### 1. Fresh Build Check

- `curl -I http://clearvestnic.ru:5180` → HTTP 200, no-cache headers.
- `build-info.json` sha matches current HEAD.
- `window.__PROCESSMAP_BUILD_INFO__` valid.

### 2. Version Proof

- Version row visible in UI (footer/bottom).
- Marker **NOT** on canvas (`document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length === 0` or equivalent).
- Version corresponds to expected (v1.0.130 or v1.0.131).

### 3. Diagram Setup

- Navigate to **wewe / "Описание процессов Долгопрудный"**.
- Overlays OFF.
- Confirm `.fpcPropertyOverlay = 0`.
- Confirm large SVG node count (≈2400).

### 4. Idle 10s Baseline

- No user action for 10 seconds.
- Measure long tasks.
- Document stability.

### 5. Real Mouse Canvas Drag — Quick/Natural

- **Use Playwright or actual pointer drag** (not synthetic zoom/click).
- 3 attempts.
- Report median duration, long tasks, DOM/SVG delta.

### 6. Real Mouse Canvas Drag — Stepped/Stress

- 3 attempts if feasible.
- Report median.

### 7. Real Element Drag

- Drag a BPMN element in Modeler default.
- Measure long tasks/duration.
- Verify **no PUT /bpmn** triggered by drag.
- Verify **no PATCH /sessions** triggered by drag.

### 8. Tab Switch

- Analysis → Diagram.
- Diagram → XML → Diagram.
- Measure time to usable canvas and long tasks.

### 9. Before/After Comparison

- Read `BASELINE_REACT_JANK_PROFILE.md` and `RUNTIME_BEFORE_AFTER.md` from Agent 2.
- Independently verify or reproduce key metrics.
- If Agent 2 claims improvement, verify it is **material** (outside noise).

## Pass / Fail Criteria

### REVIEW_PASS allowed ONLY if:

- [ ] Reviewer GSD discipline recorded.
- [ ] RAG Review Context present.
- [ ] Fresh 5180 runtime verified.
- [ ] Real drag tested (not synthetic zoom/click).
- [ ] Idle baseline captured.
- [ ] Version proof present (row visible, marker off canvas).
- [ ] Material improvement demonstrated with metrics.
- [ ] No PUT/PATCH from view interactions.

### CHANGES_REQUESTED if:

- Only source/build passed without runtime proof.
- No real drag test.
- No idle baseline.
- No RAG Review Context.
- No version proof.
- Metrics are within noise (no material improvement).
- User-visible lag remains materially unchanged without precise next bottleneck documented.

## Report

Write `REVIEW_REPORT.md` in Russian with sections:
1. Reviewer GSD Discipline
2. RAG Review Context
3. Source / Runtime Truth
4. Independent Validation Results
5. Build Verification
6. Real Drag Test Results
7. Before/After Comparison
8. Verdict (REVIEW_PASS or CHANGES_REQUESTED)
9. Risks and Limitations
10. Handoff / Next Steps

## Final Reminder

- Formal REVIEW_PASS does NOT override user-visible lag.
- If user-visible scenario still fails, verdict must be CHANGES_REQUESTED.
- Do not approve based only on synthetic tests.
