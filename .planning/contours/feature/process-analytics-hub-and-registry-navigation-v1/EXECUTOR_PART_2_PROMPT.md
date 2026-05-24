# Agent 3 / Worker Prompt

**Contour:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Run ID:** `20260517T010715Z-47422`  
**Work Package:** B — UX validation / supporting implementation  
**Language rule:** Write all reports/docs in Russian. Keep code comments in English or Russian as fits the project. Agent prompts stay in English.

---

## Your Mission

Validate the Analytics Hub implementation from Worker 2 and provide supporting UX polish. Ensure:
1. The Analytics Hub UX is clean and clear.
2. Product Actions Registry is correctly nested under Analytics, not treated as top-level root.
3. «Реестр свойств» is a clear placeholder and does not invent backend data models.
4. No confusing active top actions when Analytics is open.
5. No durable Product Actions / BPMN mutations occurred.
6. Runtime evidence is collected.

---

## Mandatory Preflight

Before starting, run:

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "feature/process-analytics-hub-and-registry-navigation-v1" \
  --query "Analytics Hub UX validation Properties Registry placeholder no backend no BPMN mutation Product Actions registry nested" \
  --format md \
  --top-k 10
```

Save output to `RAG_PREFLIGHT_WORKER_3.md` in the contour directory.

---

## Validation Tasks

### 1. Inspect Worker 2 Changes

Read:
- `WORKER_2_REPORT.md`
- `ANALYTICS_HUB_IMPLEMENTATION_REPORT.md`
- `NAVIGATION_WIRING_REPORT.md`

Independently inspect changed files:
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs`
- `frontend/src/app/processMapRouteModel.js`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/TopBar.jsx`
- `frontend/src/config/appVersion.js`
- `frontend/src/styles/tailwind.css` (or relevant CSS file)

### 2. Validate Analytics Hub UX

- Open `http://clearvestnic.ru:5180/app?surface=analytics` (or navigate there via UI).
- Verify the page shows:
  - Title: "Аналитика"
  - Description text
  - Summary/dashboard cards (4 placeholders)
  - Module cards: "Реестр действий", "Реестр свойств", "Дашборды", "Экспорт"
- Verify "Реестр свойств" card has status "Скоро" / "В разработке".
- Verify dashboard summary cards do NOT show fake numbers as if they were real data.
- Verify the layout is clean: no scattered filters, no giant table at root.
- Verify cards have clear borders/sections.

### 3. Validate Registry Nesting

- Click "Открыть" on "Реестр действий" card.
- Verify it navigates to `?surface=product-actions-registry`.
- Verify the registry page still loads correctly.
- Verify closing registry returns to Analytics Hub (or workspace, if return-to-analytics is not implemented).
- Verify the app no longer presents "Реестр действий" as the only top-level analytics page.

### 4. Validate Navigation Safety

- Verify close/back button exists on Analytics Hub.
- Verify clicking it does not trap the user.
- Verify no unrelated top actions (e.g. "Создать сессию BPMN", "Сохранить сессию") are confusingly active when Analytics Hub is open.
- Verify browser back button works if Analytics is a route.

### 5. CSS / Layout Polish (if needed)

If Worker 2 CSS is insufficient, make bounded adjustments:
- Improve card spacing, borders, or responsive behavior.
- Ensure dark/light theme compatibility using existing CSS custom properties.
- Do NOT do broad CSS refactor.

### 6. Data Safety Check

Run:
```bash
cd /opt/processmap-test
git diff --name-only
```

Confirm:
- No `backend/app/` files changed.
- No `.env` changed.
- No `package.json` / `requirements.txt` changed.
- No BPMN XML files changed.
- No RAG runtime files changed (unless this contour explicitly allows it — it does NOT).

### 7. Runtime Evidence

Collect:
- `curl -I http://clearvestnic.ru:5180` output.
- `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)" | head -20` output.
- Console messages: open browser devtools, navigate to Analytics Hub, note any errors.
- Screenshot or DOM snapshot of Analytics Hub page (if Playwright or browser tools available).
- Screenshot or DOM snapshot of "Реестр действий" module card.
- Screenshot or DOM snapshot of "Реестр свойств" placeholder.

### 8. Tests

Run:
```bash
cd /opt/processmap-test/frontend
npm run build
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPage.test.mjs
```

All must pass. If any fail, document and fix or request changes.

---

## Safety Rules

- **No backend changes.**
- **No DB schema changes.**
- **No BPMN XML mutation.**
- **No Product Actions durable truth changes.**
- **No RAG runtime changes.**
- **No package install.**
- **No commit/push/PR/deploy.**
- Keep changes bounded to UX validation and minor CSS polish.

---

## Required Reports

Create these files in the contour directory (all in Russian):

1. `WORKER_3_REPORT.md` — summary of validation findings.
2. `RAG_PREFLIGHT_WORKER_3.md` — preflight output.
3. `SOURCE_MAP_WORKER_3.md` — files inspected.
4. `UX_VALIDATION_REPORT.md` — detailed UX checks (Hub layout, cards, navigation, close/back).
5. `PROPERTIES_REGISTRY_PLACEHOLDER_REPORT.md` — proof that Properties Registry is placeholder only.
6. `DATA_SAFETY_REPORT.md` — git diff proof, no backend/BPMN/RAG changes.
7. `RUNTIME_EVIDENCE_WORKER_3.md` — curl outputs, console check, screenshots/DOM snapshots.
8. `WORKER_3_DONE` — empty marker file.

After creating all reports, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "feature/process-analytics-hub-and-registry-navigation-v1" worker3
```
