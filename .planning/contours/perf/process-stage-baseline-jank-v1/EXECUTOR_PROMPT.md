# EXECUTOR_PROMPT — Agent 2 / Executor

## Contour

`perf/process-stage-baseline-jank-v1`

## Your Role

- Execute bounded frontend performance fix.
- Write all reports/docs in **Russian**.
- Do not change backend, Product Actions, RAG tooling, AG-UI.
- Do not install packages.
- Do not commit/push/PR/deploy.

## Before Code

### 1. RAG Preflight

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "perf/process-stage-baseline-jank-v1" \
  --area "Diagram React baseline jank ProcessStage BpmnStage implementation" \
  --format md \
  --top-k 10 \
  > .planning/contours/perf/process-stage-baseline-jank-v1/RAG_PREFLIGHT_EXECUTOR.md
```

Include `## RAG Context Used` in `EXEC_REPORT.md`.

### 2. Source / Runtime Truth

Capture independently:
- `pwd`, `whoami`, `hostname`, `date -Is`
- `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
- `git diff --name-only`, `git diff --stat`
- `curl -s http://clearvestnic.ru:8088/health`
- `curl -I http://clearvestnic.ru:5180`
- `docker ps` / `docker compose ps`
- `build-info.json` from 5180
- JS asset hash from 5180 HTML

### 3. Baseline Measurement

**Target diagram:** wewe / "Описание процессов Долгопрудный"  
**Requirements:** overlays OFF, large diagram, fresh browser context.

Scenarios:
- **A. Idle 10s baseline:** measure long tasks, DOM/SVG stability, console.
- **B. Real canvas drag quick/natural:** 3 attempts, report median.
- **C. Real canvas drag stepped/stress:** 3 attempts, report median.
- **D. Real element drag:** 3 attempts, report median; verify no PUT/PATCH.
- **E. Tab switch Analysis ↔ Diagram and XML ↔ Diagram:** measure time to usable canvas.
- **F. React profiler attribution:** identify dominant React modules/functions.

Save results to `BASELINE_REACT_JANK_PROFILE.md`.

### 4. Source Map

Map React render sources:
- ProcessStage prop stability.
- BpmnStage prop stability.
- useInterviewDerivedState churn.
- Polling-induced setState chains.
- SelectedElement sync to sidebar/panels.

Save to `REACT_RENDER_SOURCE_MAP.md`.

## Implementation

### Bounded Fix Strategy

1. **Identify root cause** from profiler evidence — rank H1–H9.
2. **Apply memo boundaries** where props are unstable.
3. **Stabilize object identities** passed to BpmnStage (useRef / useMemo with deep comparison where safe).
4. **Reduce polling churn** — batch setState, reduce frequency, or use refs for non-visual state.
5. **Decomposition-first** if touching ProcessStage/BpmnStage:
   - Extract render-optimizer hook/module.
   - Do NOT add more logic into god-file.
6. **Preserve all existing tests** — do not break test contracts.

### Safety Boundaries

- NO backend/schema/storage changes.
- NO Product Actions changes.
- NO RAG tooling changes.
- NO AG-UI changes.
- NO package installation.
- NO BPMN XML mutation from view.
- NO PUT /bpmn from drag/click/view.
- NO PATCH /sessions from view interactions.

### Version / Update Ledger

- Current: `v1.0.130` (pre-existing on branch).
- If you make product code changes → bump to `v1.0.131` and add Russian changelog entry.
- Keep version marker **off canvas** (footer/bottom row only).
- Ensure `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` are valid after rebuild.

## After Code

### Rebuild & Restart

```bash
cd /opt/processmap-test/frontend
npm run build
# restart gateway if needed
docker compose restart gateway
```

### Validation

- Verify 5180 serves fresh JS (hash changed).
- Verify `build-info.json` updated.
- Verify version row visible.
- Run all measurement scenarios again.
- Compare before/after.

### Required Reports (all in Russian)

1. `EXEC_REPORT.md` — summary, what was done, evidence.
2. `RAG_PREFLIGHT_EXECUTOR.md` — saved preflight output.
3. `VERSION_UPDATE_LEDGER_PROOF.md` — version proof, build-info, screenshot description.
4. `BASELINE_REACT_JANK_PROFILE.md` — before metrics.
5. `REACT_RENDER_SOURCE_MAP.md` — profiler source attribution.
6. `PROCESS_STAGE_JANK_ROOT_CAUSE.md` — root cause with evidence.
7. `RUNTIME_BEFORE_AFTER.md` — before/after comparison table.
8. `DECOMPOSITION_REPORT.md` — if extraction happened.
9. `IMPLEMENTATION_NOTES.md` — technical details for future agents.
10. `NEXT_BOTTLENECK_DECISION.md` — if not materially solved, precise next bottleneck.
11. `READY_FOR_REVIEW` — marker file if complete.
12. `EXEC_BLOCKED.md` — if blocked, with reason and next steps.

## Final Checklist

- [ ] RAG preflight run and saved.
- [ ] Source/runtime truth captured.
- [ ] Baseline measured before code.
- [ ] Root cause identified with evidence.
- [ ] Bounded fix applied.
- [ ] Rebuild passes (0 errors).
- [ ] 5180 serving fresh build.
- [ ] After-code measured.
- [ ] Material improvement demonstrated.
- [ ] Version row updated.
- [ ] All reports written in Russian.
- [ ] READY_FOR_REVIEW or EXEC_BLOCKED created.
