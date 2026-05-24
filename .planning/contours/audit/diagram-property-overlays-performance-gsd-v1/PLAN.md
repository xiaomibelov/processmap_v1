# audit/diagram-property-overlays-performance-gsd-v1

## GSD Discipline

- **GSD availability result**: AVAILABLE
- **Commands executed**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 47 skills found
  - `find /root/.codex/agents -maxdepth 2 -type d -name 'gsd-*'` → 0 directories (skills live under skills/)
- **Mode used**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **PATH augmented**: `export PATH="/opt/processmap-test/bin:$PATH"`
- **Confirmations**:
  - Implementation не выполнялся — Agent 1 только планирование.
  - Product files не менялись — никаких изменений в frontend/backend.
  - Contour bounded — только audit/diagram-property-overlays-performance-gsd-v1.
  - Agent 2 / Agent 3 gates prepared — EXECUTOR_PROMPT.md и REVIEWER_PROMPT.md созданы.

## Source / Runtime Truth

Captured at: `2026-05-14T22:03:36+00:00`

| Check | Value |
|-------|-------|
| pwd | `/opt/processmap-test` |
| whoami | `root` |
| hostname | `clearvestnic.ru` |
| git branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| git status | M `.env`, M `frontend/src/components/AppShell.jsx`, M `frontend/src/components/ProcessStage.jsx`, M `frontend/src/components/TopBar.jsx`, M `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs`, M `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`, M `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`, M `frontend/src/features/process/hooks/useProcessTabs.js`, M `frontend/src/styles/tailwind.css` |
| API health | `{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy",...}}` |
| Frontend (:5180) | HTTP/1.1 200 OK |
| API (:8088) | Healthy |

**Active related contours**:
- `.planning/contours/perf/session-analysis-bpmn-tab-switch-load-regression-v1/` — COMPLETED (READY_FOR_REVIEW, REVIEW_REPORT.md present). This contour audited BPMN tab switch load regression. Our contour goes deeper into overlay-specific performance.

**Runtime endpoints**:
- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`
- API health: `http://clearvestnic.ru:8088/health`

## Problem Statement

ProcessMap Diagram/BPMN surface exhibits slowdowns, particularly when property overlays are visible. The user observes:

- Diagram/BPMN can lag during interaction;
- Interface becomes heavier when property overlays are displayed;
- Property overlays may impact canvas performance;
- Root cause is unknown — could be React re-renders, bpmn-js overlays, DOM inflation, layout/reflow, network refetch, autosave/patches, heavy derived state, or listener/effect leaks.

This is an **audit contour** — goal is to gather source/runtime evidence, build a source map, rank root-cause hypotheses, and produce bounded fix recommendations. No code changes in this contour.

## Audit Scope

**In scope**:
- Diagram/BPMN tab rendering performance;
- Property overlay layer behavior (creation, update, cleanup);
- bpmn-js overlay lifecycle;
- React mount/unmount/remount patterns around Diagram;
- Network request patterns during Diagram interaction;
- Console errors/warnings during Diagram usage;
- EventBus listener registration/cleanup;
- DOM node growth during overlay visibility toggles;
- Duplicate toast/notification/limit/version messages;
- Tab switch (Analysis ↔ Diagram) performance;
- Pan/zoom/selection/hover responsiveness;
- Memory leak indicators (duplicate overlays, orphaned listeners).

**Related prior work**:
- `perf/session-analysis-bpmn-tab-switch-load-regression-v1` — already audited tab switch load regression. This contour extends with overlay-specific and deeper canvas performance analysis.

## Runtime Reproduction Plan

See `RUNTIME_NAVIGATION.md` for detailed step-by-step navigation.

Summary of scenarios:

| Scenario | Focus | Key Metrics |
|----------|-------|-------------|
| A — Baseline Diagram open | Initial load | Time to canvas, network count, console errors, DOM size |
| B — Analysis ↔ Diagram tab switch | Tab switching | Timing, repeated requests, duplicate messages, remount |
| C — Overlay visibility | Property overlays | UI responsiveness, network, DOM growth, duplicate overlays |
| D — Pan/zoom performance | Canvas interaction | Smoothness, jank, overlay update cost |
| E — Large diagram / heavy session | Scalability | Repeat A–D on session with many elements |

## Measurement Plan

### 1. Timings
- Initial Diagram load time (from tab click to visible canvas);
- Tab switch to Diagram after initial load;
- Tab switch back to Analysis;
- Overlay show/hide response time;
- Select element response time;
- Pan/zoom subjective + measurable if browser perf tools available.

### 2. Network
Track per scenario:
- Total request count;
- Duplicate request count;
- Heavy endpoints repeated;
- Mutation request count;
- Failed requests.

Endpoints to watch:
- `GET /api/sessions/{id}`
- `GET /api/sessions/{id}/bpmn`
- `GET /api/sessions/{id}/bpmn/versions`
- `PATCH /api/sessions/{id}`
- `PUT /api/sessions/{id}/bpmn`
- Any diagram-state/property endpoints;
- Any version/limit endpoints.

### 3. DOM / Overlays
- Approximate count of `.djs-overlay`, `.djs-overlay-container`, custom property overlay classes;
- Duplicate overlays for same BPMN element if detectable;
- DOM node count before/after overlay toggles;
- Overlay node count after tab switch cycles.

### 4. React / Render Symptoms
- Repeated mount/unmount patterns from logs if available;
- Duplicated useEffect triggers;
- StrictMode double effect candidates;
- State reset candidates.

### 5. UX Symptoms
- Visible loader duration;
- Frozen UI;
- Delayed clicks;
- Duplicate toasts;
- Property overlay flicker;
- Layout shift;
- Overlay z-index/clipping issues.

## Source Map Targets

Agent 2 must build a concrete source map. Starting search targets:

### Frontend search commands
```bash
grep -R "Diagram (BPMN)\|Diagram\|BPMN" -n frontend/src 2>/dev/null | head -300
grep -R "overlay\|overlays\|djs-overlay\|properties\|property" -ni frontend/src 2>/dev/null | head -500
grep -R "bpmn-js\|BpmnJS\|Modeler\|Viewer\|elementRegistry\|eventBus\|canvas" -ni frontend/src 2>/dev/null | head -500
grep -R "useEffect" -n frontend/src | grep -Ei "bpmn|diagram|overlay|property|selection|canvas|modeler" | head -500
grep -R "fetchBpmn\|loadBpmn\|getBpmn\|bpmn/versions\|fetchVersions\|loadVersions" -ni frontend/src backend 2>/dev/null | head -500
grep -R "toast\|notification\|limit\|лимит\|version\|верси" -ni frontend/src backend 2>/dev/null | head -500
grep -R "selection.changed\|element.hover\|element.out\|canvas.viewbox.changed\|commandStack.changed" -ni frontend/src 2>/dev/null | head -500
```

### Candidate areas
- Session editor / route container;
- Tab container (Analysis ↔ Diagram);
- BPMN Diagram tab component;
- BpmnStage / bpmn-js wrapper component;
- Overlay components and hooks;
- Property sidebar / property overlay layer;
- Extension-state overlays;
- Selection/hover handlers;
- Canvas eventBus listeners;
- BPMN XML loader hook;
- Versions/history hooks;
- Toast/notification logic;
- API client / session hooks;
- Cache/dedupe utilities;
- Styles for overlays.

### Backend (read-only inspection only if needed)
- Session GET;
- BPMN GET;
- Versions GET;
- PATCH session;
- PUT BPMN;
- Any diagram_state/property endpoints.

## Root-Cause Hypotheses

Agent 2 must verify and rank these:

| ID | Hypothesis | Priority |
|----|-----------|----------|
| H1 | Overlay DOM inflation — property overlays create too many DOM nodes, re-created on every render/tab switch | High |
| H2 | Duplicate bpmn-js overlays — overlays added repeatedly without remove/cleanup | High |
| H3 | EventBus listener leak — listeners for selection/hover/viewbox registered repeatedly and not cleaned up | High |
| H4 | Heavy React remount — Diagram/BPMN tab unmounts/remounts on each tab switch, forcing modeler/canvas rebuild | High |
| H5 | BPMN modeler reinitialization — bpmn-js Modeler/Viewer recreated instead of preserved | High |
| H6 | Heavy data refetch — tab switch/overlay visibility triggers full session/BPMN/versions refetch | Medium |
| H7 | Accidental versions fetch — `/bpmn/versions` called when overlays/properties shown, even though history UI not opened | Medium |
| H8 | Mutation on non-edit interaction — selection/overlay visibility triggers PATCH/PUT/save state without explicit user save | Medium |
| H9 | Derived analysis/property map recomputed too often — large maps recomputed on each hover/selection/render | Medium |
| H10 | CSS/layout cost — overlay CSS causes expensive layout/repaint (shadows, backdrop filters, transitions) | Medium |
| H11 | ResizeObserver/MutationObserver loop — overlay/side panel observers causing repeated layout passes | Low |
| H12 | Toast/notification dedupe missing — version/limit messages emitted repeatedly due to repeated effects/request results | Low |
| H13 | Cache keys unstable — query/cache keys include transient objects or tab state, causing dedupe miss | Low |
| H14 | Development StrictMode double effect — double effects expose missing idempotency/cleanup | Low |

## Agent 2 Execution Plan

Agent 2 must:

1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
2. Run runtime/source truth checks.
3. Execute runtime scenarios A–E where feasible.
4. Capture network, console, screenshots, request counts, overlay/DOM counts, timing notes, duplicate toasts/messages.
5. Build concrete source map:
   - Exact files;
   - Exact hooks/effects;
   - Exact API callers;
   - Exact overlay creation/cleanup logic;
   - Exact eventBus listeners.
6. Rank root causes: confirmed / likely / possible / rejected.
7. Produce fix recommendations: P0 minimal safe fix, P1 performance cleanup, P2 architecture improvement.
8. Do **not** change product code.
9. If blocked, create `EXEC_BLOCKED.md` and do **not** create `READY_FOR_REVIEW`.
10. Create/update Project Atlas note:
    `/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Property Overlays Performance Audit.md`

## Agent 3 Review Plan

Agent 3 must:

1. Read all audit outputs.
2. Re-run at least one runtime scenario with Playwright if possible.
3. Verify:
   - Evidence exists;
   - Source map is concrete;
   - Hypotheses are evidence-based;
   - Network findings are specific;
   - Overlay findings are specific;
   - No product code changed;
   - No secrets;
   - Recommendations are bounded and actionable.
4. Fail if report is generic, no runtime evidence, no source map, no network/request evidence, no overlay-specific analysis, recommendations vague, product files changed, missing Project Atlas note, no clear next contour proposal.
5. If fail → `CHANGES_REQUESTED` + `REWORK_REQUEST.md`.
6. If pass → `REVIEW_REPORT.md` + `REVIEW_PASS`.

## Non-goals

- **No product code changes** in this contour;
- **No BPMN XML mutation**;
- **No backend schema/storage changes**;
- **No deploy/PR/merge**;
- **No RAG bootstrap**;
- **No MCP repair**;
- **No GSD repair**;
- **No .env changes**;
- **No AG-UI changes**;
- **No Product Actions AI changes**;
- **No registry changes**;
- **No broad refactor** of Diagram/editor architecture without source proof;
- **No fixing** — only audit, diagnosis, and bounded recommendations.

## Deliverables

### Agent 1 (this file set)
- `PLAN.md`
- `EXECUTOR_PROMPT.md`
- `REVIEWER_PROMPT.md`
- `RUNTIME_NAVIGATION.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `STATE.json`
- `AGENT_RUN_ID`
- `READY_FOR_EXECUTION`

### Agent 2 (audit execution)
- `EXEC_REPORT.md`
- `PERFORMANCE_AUDIT_REPORT.md`
- `SOURCE_MAP.md`
- `NETWORK_EVIDENCE.md`
- `ROOT_CAUSE_HYPOTHESES.md`
- `FIX_RECOMMENDATIONS.md`
- `READY_FOR_REVIEW`
- Project Atlas audit note

### Agent 3 (review)
- `REVIEW_REPORT.md`
- `REVIEW_PASS` or `CHANGES_REQUESTED` + `REWORK_REQUEST.md`

## Risks

| Risk | Mitigation |
|------|-----------|
| Playwright unavailable → no runtime evidence | Agent 2 must document `PLAYWRIGHT_UNAVAILABLE` and do source-level audit; Agent 3 may require rework if evidence insufficient |
| No session with BPMN + overlays available | Agent 2 must document and try to create/load a test session; if impossible, document blocker |
| Large unrelated changes in working tree | Agent 2 must verify runtime serves intended code, not stale build |
| Hypotheses too vague | Ranked with evidence tags; rejected hypotheses documented with reason |
| Recommendations become implementation | Strict non-goal enforcement; P0/P1/P2 recommendations only |

## Gates

- [x] **Gate 1** — GSD discipline completed
- [x] **Gate 2** — Source/runtime truth captured
- [x] **Gate 3** — Runtime reproduction plan defined
- [x] **Gate 4** — Diagram overlay performance symptoms defined
- [x] **Gate 5** — Measurement plan defined
- [x] **Gate 6** — Network/render/source-map targets defined
- [x] **Gate 7** — Root-cause hypotheses defined
- [x] **Gate 8** — Non-goals locked
- [x] **Gate 9** — Agent 2 audit prompt ready (EXECUTOR_PROMPT.md)
- [x] **Gate 10** — Agent 3 review prompt ready (REVIEWER_PROMPT.md)
- [x] **Gate 11** — READY_FOR_EXECUTION marker created
