# REVIEWER_PROMPT — perf/diagram-human-perceived-pan-and-drag-smoothness-v1

**Role**: Agent 3 / Reviewer  
**Contour**: `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Scope**: Strict independent review with human-perceived smoothness validation. No source-only pass allowed.  
**Language rule**: All reports, docs, and user-facing summaries must be written in **Russian**. Preserve exact Russian UI labels when referencing ProcessMap UI. This prompt is in English.

---

## 1. Reviewer GSD Discipline — Mandatory

Agent 3 must run:
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

If GSD is available:
- Use GSD review/check discipline.

If GSD is unavailable:
- Continue as `GSD_FALLBACK_MANUAL_REVIEW_ONLY`.
- Document fallback in `REVIEW_REPORT.md`.

`REVIEW_REPORT.md` must contain:
- ## Reviewer GSD Discipline

---

## 2. Reviewer RAG Preflight — Mandatory

Agent 3 must run:
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" \
  --query "Diagram performance review rules user manual validation pointer-follow latency real drag smoothness no false REVIEW_PASS" \
  --format md \
  --top-k 12
```

Save output to `RAG_PREFLIGHT_REVIEWER.md` in this contour directory (overwrite or update).

`REVIEW_REPORT.md` must contain:
- ## RAG Review Context

---

## 3. Independent Source / Runtime Truth Verification

Capture independently and compare to Agent 2:
- `pwd`, `whoami`, `hostname`, `date -Is`
- `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
- `git diff --name-only`, `git diff --stat`
- `curl -s http://clearvestnic.ru:8088/health`
- `curl -I http://clearvestnic.ru:5180`
- Docker ps / compose status

Report any divergence.

---

## 4. Fresh 5180 Runtime Proof

- `curl -I http://clearvestnic.ru:5180` must return HTTP 200 with `Cache-Control: no-cache, no-store, must-revalidate`.
- `build-info.json` SHA must match `git rev-parse HEAD`.
- `window.__PROCESSMAP_BUILD_INFO__` must match `build-info.json`.
- Served JS asset hash must be fresh (not stale).

---

## 5. Version / Marker Verification

- Footer must show version row (e.g., `Версия v1.0.132 · shaShort · date · contourId`).
- Marker must NOT be on canvas:
  ```js
  document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length === 0
  ```
- `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` valid.

Fail review if:
- Version row missing.
- Marker on canvas.
- Build-info mismatch.
- Runtime 5180 stale.

---

## 6. Large No-Overlays Diagram Selection

- Navigate to `wewe` / «Описание процессов Долгопрудный».
- Ensure overlays OFF (`window.fpcPropertyOverlay = 0` or UI «Слои OFF»).
- Confirm DOM/SVG counts are in expected range (historically ~8000 DOM, ~2400 SVG).

---

## 7. Real Manual-Like Canvas Pan — Mandatory

Use Playwright `mouse.down/move/up` or browser-level real pointer events.

### Scenarios:
1. **Empty region pan** — quick natural drag, 3 attempts.
2. **Empty region pan** — slow controlled drag, 3 attempts.
3. **Dense region pan** — quick natural drag, 3 attempts.
4. **Dense region pan** — slow controlled drag, 3 attempts.
5. **Diagonal drag** — 3 attempts.

For each:
- Record subjective smoothness (smooth / slightly jittery / materially jittery / unusable).
- Record pointer-follow lag perception (none / slight / material).
- Note exact location/zoom.

---

## 8. Real Element Drag — Mandatory

Unless explicitly impossible with documented proof:

1. Select a visible BPMN element (Activity / Gateway / Event).
2. Drag it 100–200 px.
3. 3 attempts.
4. Record:
   - Subjective smoothness.
   - Property panel impact.
   - Auto-save PUT after pointerup (pre-existing, note but do not block if unchanged).

If element drag is impossible in test environment:
- Document exactly why with evidence.
- State which shapes were attempted and why they failed.

---

## 9. Human-Perceived Smoothness Review — Mandatory

`REVIEW_REPORT.md` must contain:

## Human-Perceived Smoothness Review

It must answer ALL of the following:

1. **Did canvas follow pointer smoothly?**
   - Empty region: yes / slightly / no
   - Dense region: yes / slightly / no
   - Diagonal: yes / slightly / no

2. **Was dense-region drag still jittery?**
   - If yes — was the jitter reduced compared to v1.0.131 baseline?
   - If no jitter — confirm smooth classification.

3. **Was element drag smooth?**
   - If tested: yes / slightly / no
   - If not tested: explain why with proof

4. **Did it feel better than v1.0.131 manual baseline?**
   - User reported v1.0.131 as "10% smoother, still jitters, canvas does not keep up".
   - Is the improvement materially perceptible?

5. **Would a user perceive the improvement?**
   - Honest assessment. If improvement is within noise or only measurable in metrics, say so.

6. **If not REVIEW_PASS, why?**
   - Specific reason: jitter remains, pointer lag remains, dense region unchanged, element drag broken, etc.

---

## 10. Frame Pacing Verification (Where Possible)

If Agent 2 provided frame pacing data:
- Verify consistency.
- Re-run at least one scenario independently and compare.

If Agent 2 did not provide frame pacing:
- Document as gap but do not block solely on this if human-perceived check is strong.

---

## 11. Network Safety Verification

During canvas pan and element drag:
- `PUT /bpmn` during drag: must be 0.
- `PATCH /sessions` during drag: must be 0.
- Background polling (presence, versions) is pre-existing; note but do not block.

---

## 12. Before/After Evidence

Verify Agent 2 provided:
- `HUMAN_PERCEIVED_SMOOTHNESS_BEFORE_AFTER.md`
- `RUNTIME_BEFORE_AFTER.md`

Check:
- Before classification vs after classification — must show improvement or precise next bottleneck.
- If metrics improved but human classification did not — this is NOT sufficient for REVIEW_PASS.

---

## 13. No REVIEW_PASS If

Block REVIEW_PASS if ANY of the following is true:

- [ ] Reviewer GSD section missing.
- [ ] RAG Review Context section missing.
- [ ] Fresh 5180 proof missing.
- [ ] Human-perceived smoothness check missing.
- [ ] Real canvas pan/drag not tested.
- [ ] Real element drag not tested unless explicitly impossible with proof.
- [ ] Pointer-follow latency or visual jitter remains materially visible.
- [ ] Only long-task metrics improved.
- [ ] Metrics are within noise.
- [ ] No before/after comparison.
- [ ] Product runtime changed out of scope.
- [ ] Version row missing / marker on canvas / build-info stale.

---

## 14. Verdict Options

- **REVIEW_PASS** — All criteria met, human-perceived smoothness materially improved, no regressions.
- **CHANGES_REQUESTED** — Specific issues identified; Agent 2 must rework.
- **REWORK_LOOP** — If Agent 2 disagrees, provide evidence; loop until consensus or user escalation.

---

## 15. Final Report Requirements

`REVIEW_REPORT.md` must include (in Russian):

1. ## Reviewer GSD Discipline
2. ## RAG Review Context
3. ## Source / Runtime Truth
4. ## Independent Validation Results
5. ## Human-Perceived Smoothness Review
6. ## Frame Pacing Verification
7. ## Network Safety Verification
8. ## Before/After Evidence Review
9. ## Verdict
10. ## Risks and Limitations
11. ## Handoff

Also write `REVIEW_RUN_ID` containing the launcher run id if known.
