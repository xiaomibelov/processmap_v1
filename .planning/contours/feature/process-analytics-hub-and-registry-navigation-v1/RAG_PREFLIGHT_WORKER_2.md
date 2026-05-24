# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: feature/process-analytics-hub-and-registry-navigation-v1
- **area/query**: ProcessMap Analytics Hub implementation Product Actions Registry navigation route model ProcessStage
- **generated_at**: 2026-05-17T08:53:41.866Z

## Structured Facts

### Runtime Facts
- **server_host**: clearvestnic.ru (test, high)
- **repo_root**: /opt/processmap-test (test, high)
- **frontend_url**: http://clearvestnic.ru:5180 (test, high)
- **api_health_url**: http://clearvestnic.ru:8088/health (test, high)
- **project_atlas_server_path**: /srv/obsidian/project-atlas (test, high)
- **project_atlas_local_path**: /Users/mac/Documents/Obsidian/ProjectAtlas (local, medium)
- **active_contour_root**: /opt/processmap-test/.planning/contours/<CID> (test, high)

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)

## Supporting Documents

### #1 — 2. Navigation / back button
- **score**: 38.894
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## 2. *Navigation* / back button
- When user is on *registry* *route* (`surface=*product*-*actions*-*registry*`), the TopBar `← Проекты` / `← К проекту` button must be **hidden or visually disabled**. - Safe *implementation*: - Add optional prop `hideBackButton` (or `backButtonMode`) to `TopBar.jsx`. - In `AppShell.jsx`, detect *registry* *route* (via `*product**Actions**Registry**Route*.active` or URL check) and pass the prop. - Default behavior on non-*registry* screens must be unchanged.
```

### #2 — 2. Navigation / back button
- **score**: 35.894
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## 2. *Navigation* / back button
- When user is on *registry* *route* (`surface=*product*-*actions*-*registry*`), the TopBar `← Проекты` / `← К проекту` button must be **hidden or visually disabled**. - Safe *implementation*: - Add optional prop `hideBackButton` (or `backButtonMode`) to `TopBar.jsx`. - In `AppShell.jsx`, detect *registry* *route* (via `*product**Actions**Registry**Route*.active` or URL check) and pass the prop. - Default behavior on non-*registry* screens must be unchanged.
```

### #3 — Route logic
- **score**: 34.711
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## *Route* logic
- `frontend/src/app/*processMap**Route**Model*.js` — `read*Product**Actions**Registry**Route*()` parses `?surface=*product*-*actions*-*registry*`. - `frontend/src/components/*ProcessStage*.jsx` — conditionally renders `<*Product**Actions**Registry*Page>` when `*product**Actions**Registry**Route*.active` is true. ---
```

### #4 — Runtime Navigation — Product Actions Registry
- **score**: 33.104
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## Runtime *Navigation* — *Product* *Actions* *Registry*
> **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Purpose:** How to reach and inspect the target surface at runtime. ---
```

### #5 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 32.434
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX planning for *product* *actions* *registry* workspace *analytics* screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #6 — 2. Navigation / back button
- **score**: 32.051
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## 2. *Navigation* / back button
- `TopBar.jsx` now accepts `hideBackButton` prop (default `false`). - `AppShell.jsx` computes `*registry**Route*Active` by reading `?surface=*product*-*actions*-*registry*` from the URL. - Uses a `useEffect` that monkey-patches `history.pushState`/`history.replaceState` and listens to `popstate` / custom `locationchange` events to keep the flag reactive. - When on *registry* *route*, the `← Проекты` / `← К проекту` button is **not rendered**. - **Non-*registry* screens:** default behavior unchanged because `hideBackBut…
```

### #7 — Runtime inspection protocol
- **score**: 31.721
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] 1. Open the *ProcessMap* runtime via Playwright MCP: - URL: `http://clearvestnic.ru:5180` 2. Navigate to the *registry* screen: - *Route*: `?surface=*product*-*actions*-*registry*` (or use in-app *navigation* if available). 3. Interact with the UI: - Hover over table rows. - Click scope tabs. - Open/close filters if collapsible. - Scroll. 4. Check console errors and network failures. 5. Capture screenshots or document evidence. ---
```

### #8 — Route logic
- **score**: 31.711
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_NAVIGATION.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *Route* logic
- `frontend/src/app/*processMap**Route**Model*.js` — `read*Product**Actions**Registry**Route*()` parses `?surface=*product*-*actions*-*registry*`. - `frontend/src/components/*ProcessStage*.jsx` — conditionally renders `<*Product**Actions**Registry*Page>` when `*product**Actions**Registry**Route*.active` is true. ---
```

### #9 — Route
- **score**: 31.587
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *Route*
``` http://clearvestnic.ru:5180?surface=*product*-*actions*-*registry*&scope=workspace ```
```

### #10 — Route mechanics
- **score**: 31.471
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## *Route* mechanics
- `frontend/src/app/*processMap**Route**Model*.js` — `read*Product**Actions**Registry**Route*()` reads `?surface=*product*-*actions*-*registry*&scope=...`. - `*ProcessStage*.jsx` conditionally renders `<*Product**Actions**Registry*Page>` when `*product**Actions**Registry**Route*.active === true`. - The page wrapper is `frontend/src/components/process/analysis/*Product**Actions**Registry*Page.jsx`. - The main UI is `frontend/src/components/process/analysis/*Product**Actions**Registry*Panel.jsx` (`*Product**Actions**Registry*Content`).
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "feature/process-analytics-hub-and-registry-navigation-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "feature/process-analytics-hub-and-registry-navigation-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "feature/process-analytics-hub-and-registry-navigation-v1" --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
