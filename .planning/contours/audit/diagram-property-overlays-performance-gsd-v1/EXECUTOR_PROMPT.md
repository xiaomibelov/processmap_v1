# Agent 2 / Executor Prompt

## Contour
- **ID**: `audit/diagram-property-overlays-performance-gsd-v1`
- **Run ID**: `20260514T220133Z-82898`
- **Role**: Agent 2 / Executor
- **Scope**: Audit and diagnose Diagram/BPMN performance slowdowns, especially with property overlays visible.

## Hard Rules

- **NO product code changes**.
- **NO BPMN XML mutation**.
- **NO backend schema/storage changes**.
- **NO deploy/PR/merge/commit**.
- **NO .env changes**.
- **NO AG-UI changes**.
- **NO durable truth mutation**.
- Read-only inspection of backend only if needed.

## Pre-execution Checklist

Before starting, read:
1. `PLAN.md`
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. `STATE.json`

Then run source/runtime truth:
```bash
cd /opt/processmap-test
pwd
whoami
hostname
date -Is
git status -sb
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
curl -s http://clearvestnic.ru:8088/health
curl -I http://clearvestnic.ru:5180
```

## Execution Tasks

### Task 1 — Runtime Scenarios A–E

Execute scenarios from `RUNTIME_NAVIGATION.md`:

| Scenario | Key Actions | Evidence to Capture |
|----------|-------------|---------------------|
| A — Baseline Diagram open | Open frontend, navigate to session with BPMN, switch to Diagram tab | Timing, network requests, console errors, visible loaders/toasts, approximate DOM count |
| B — Analysis ↔ Diagram tab switch | Switch Analysis→Diagram→Analysis→Diagram→Analysis | Timings, repeated requests, duplicate version/limit notifications, remount/refetch indicators |
| C — Overlay visibility | Enable property overlays, toggle if available, select 5–10 elements, hover 5–10, open/close property details | UI responsiveness, console errors, network requests, DOM/overlay growth, duplicate overlays |
| D — Pan/zoom performance | Zoom in/out, pan canvas, select element | Smoothness vs jank, overlay update cost |
| E — Large diagram | Find session with many BPMN elements/steps, repeat A–D | Scalability symptoms |

**If Playwright is available**: use Playwright MCP or browser automation to capture network, console, screenshots, and DOM counts programmatically.

**If Playwright is unavailable**: document `PLAYWRIGHT_UNAVAILABLE`, perform manual browser observation, and do deeper source-level audit.

### Task 2 — Source Map Construction

Run the following read-only searches and map exact files:

```bash
grep -R "Diagram (BPMN)\|Diagram\|BPMN" -n frontend/src 2>/dev/null | head -300
grep -R "overlay\|overlays\|djs-overlay\|properties\|property" -ni frontend/src 2>/dev/null | head -500
grep -R "bpmn-js\|BpmnJS\|Modeler\|Viewer\|elementRegistry\|eventBus\|canvas" -ni frontend/src 2>/dev/null | head -500
grep -R "useEffect" -n frontend/src | grep -Ei "bpmn|diagram|overlay|property|selection|canvas|modeler" | head -500
grep -R "fetchBpmn\|loadBpmn\|getBpmn\|bpmn/versions\|fetchVersions\|loadVersions" -ni frontend/src backend 2>/dev/null | head -500
grep -R "toast\|notification\|limit\|лимит\|version\|верси" -ni frontend/src backend 2>/dev/null | head -500
grep -R "selection.changed\|element.hover\|element.out\|canvas.viewbox.changed\|commandStack.changed" -ni frontend/src 2>/dev/null | head -500
```

For each candidate file, document:
- File path;
- Function/component/hook name;
- What it does (overlay creation, eventBus listener, API call, state update);
- Cleanup logic (if any);
- Dependencies that could cause re-run.

### Task 3 — Hypothesis Verification

For each hypothesis H1–H14 from `PLAN.md`, collect evidence and rank:

| Rank | Meaning |
|------|---------|
| **confirmed** | Direct evidence observed (network log, DOM count, code trace) |
| **likely** | Strong indirect evidence, reproducible symptom |
| **possible** | Weak evidence, needs more investigation |
| **rejected** | Evidence contradicts hypothesis |

### Task 4 — Fix Recommendations

Produce three tiers:

- **P0 — Minimal safe fix**: smallest change with biggest performance impact, zero architecture change;
- **P1 — Performance cleanup**: targeted cleanup of leaks, duplicates, unnecessary fetches;
- **P2 — Architecture improvement**: structural improvements (virtualization, caching, component splitting) for future contour.

Each recommendation must reference:
- Specific source file(s);
- Specific function/hook/component;
- Expected impact;
- Risk level.

### Task 5 — Evidence Files

Create/update files in evidence directory:

```
.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/evidence/
  runtime-navigation.md
  network-baseline.md
  network-overlay.md
  console-baseline.md
  performance-notes.md
  dom-overlay-counts.md
```

Screenshots (if Playwright available):
```
  screenshot-diagram-loaded.png
  screenshot-overlays-visible.png
```

### Task 6 — Project Atlas Note

Create/update:
```
/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Property Overlays Performance Audit.md
```

With summary of findings, ranked hypotheses, and recommended next contour.

### Task 7 — Final Reports

Create in contour root:
- `EXEC_REPORT.md` — execution summary, what was done, what was blocked;
- `PERFORMANCE_AUDIT_REPORT.md` — full findings with evidence;
- `SOURCE_MAP.md` — concrete source map;
- `NETWORK_EVIDENCE.md` — network findings;
- `ROOT_CAUSE_HYPOTHESES.md` — ranked hypotheses with evidence;
- `FIX_RECOMMENDATIONS.md` — P0/P1/P2 recommendations;
- `READY_FOR_REVIEW` — marker file.

## Blocker Handling

If blocked at any point:
1. Create `EXEC_BLOCKED.md` documenting the blocker;
2. Do **not** create `READY_FOR_REVIEW`;
3. Document what was completed before the blocker.

## Success Criteria

- At least 3 runtime scenarios attempted with documented results;
- Source map covers all major overlay/Diagram/BPMN files;
- All H1–H14 hypotheses ranked with evidence;
- At least one P0 recommendation;
- No product code changed;
- Project Atlas note created.
