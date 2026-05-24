# Agent 3 / Worker Prompt

**Contour:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Run ID:** `20260517T084454Z-64313`  
**Work Package:** B — Independent UX / data-safety / source-inspection lane  
**Language rule:** Write all reports/docs in Russian. Keep code comments in English or Russian as fits the project. Agent prompts stay in English.

---

## Your Mission

Perform an **independent** inspection of the current Product Actions Registry and Analytics Hub source, and produce UX acceptance, data-safety, and placeholder evidence. You do NOT validate another agent's implementation. You inspect the product source directly and prepare bounded materials for the final reviewer.

Ensure:
1. Product Actions Registry assumptions are documented.
2. Analytics Hub placeholder rules are defined (no fake dashboard numbers).
3. «Реестр свойств» is bounded as a pure placeholder (no backend data models invented).
4. Navigation safety and close/back behavior expectations are documented.
5. Data safety is confirmed: no backend/BPMN/RAG mutations in scope.
6. A runtime validation checklist is prepared for Agent 4.
7. Bounded UX/docs/test fixtures or non-conflicting CSS notes are added only if safe.

---

## Mandatory Preflight

Before starting, run:

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "feature/process-analytics-hub-and-registry-navigation-v1" \
  --query "Analytics Hub UX validation Properties Registry placeholder no backend no BPMN mutation Product Actions registry nested independent inspection" \
  --format md \
  --top-k 10
```

Save output to `RAG_PREFLIGHT_WORKER_3.md` in the contour directory.

---

## Independence Rule (CRITICAL)

- You must NOT wait for WORKER_2_DONE.
- You must NOT validate Worker 2 implementation.
- You must NOT read WORKER_2_REPORT.md as a prerequisite.
- You must NOT say "after Worker 2" or "depends on Worker 2".
- You must NOT review Worker 2 code quality as your primary task.
- You must NOT create global `EXEC_BLOCKED.md`.
- You must NOT issue `REVIEW_PASS` or `CHANGES_REQUESTED`.

Your job is to inspect the **product source** independently and produce **your own** evidence package.

---

## Work Tasks

### 1. Independent Source Inspection

Read the following product files directly from the repo (do NOT rely on another agent's report):
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs`
- `frontend/src/app/processMapRouteModel.js`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/TopBar.jsx`
- `frontend/src/config/appVersion.js`
- `frontend/src/styles/tailwind.css` (or relevant CSS file)
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx`

Document what you found in `SOURCE_MAP_WORKER_3.md`.

### 2. UX Acceptance Criteria Report

Create `UX_ACCEPTANCE_CRITERIA_REPORT.md` (in Russian) documenting:
- Expected Analytics Hub layout: title «Аналитика», description, summary cards, module cards.
- Expected module cards: «Реестр действий», «Реестр свойств», «Дашборды», «Экспорт».
- Expected placeholder rules: summary cards must show neutral placeholder (`—`) if real data is not safely available. NO fake numbers presented as real.
- Expected navigation: close/back button exists, user is not trapped.
- Expected TopBar behavior: passive label on analytics surface, no broken back button on normal screens.
- Expected registry nesting: «Реестр действий» opens from Hub, close returns to Hub or workspace.

### 3. Properties Registry Placeholder Report

Create `PROPERTIES_REGISTRY_PLACEHOLDER_REPORT.md` (in Russian) documenting:
- «Реестр свойств» must be a pure UI placeholder with status «Скоро» or «В разработке».
- No backend API calls for properties registry.
- No new DB entities or schema changes.
- No fake data model invented in frontend code.
- Badge/text must clearly communicate "future feature" to the user.

### 4. Data Safety Report

Run:
```bash
cd /opt/processmap-test
git diff --name-only
```

Create `DATA_SAFETY_REPORT.md` (in Russian) documenting:
- Confirm NO `backend/app/` files changed.
- Confirm NO `.env` changed.
- Confirm NO `package.json` / `requirements.txt` changed.
- Confirm NO BPMN XML files changed.
- Confirm NO RAG runtime files changed (unless this contour explicitly allows it — it does NOT).
- Confirm NO Product Actions durable truth mutations.
- List all changed files and confirm they are within bounded frontend scope.

### 5. Runtime Review Checklist for Agent 4

Create `RUNTIME_REVIEW_CHECKLIST_FOR_AGENT4.md` (in Russian) with a checklist that Agent 4 can use to validate the runtime. Include:
- [ ] `curl -I http://clearvestnic.ru:5180` → HTTP 200.
- [ ] `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"` → valid JSON.
- [ ] Open `http://clearvestnic.ru:5180/app?surface=analytics`.
- [ ] Title "Аналитика" is visible.
- [ ] Description text is visible.
- [ ] Dashboard summary cards exist without fake numbers.
- [ ] Module card "Реестр действий" exists with "Открыть" CTA.
- [ ] Module card "Реестр свойств" exists with "Скоро" status.
- [ ] Module card "Дашборды" exists.
- [ ] Close/back button is visible and functional.
- [ ] Clicking "Открыть" on "Реестр действий" navigates to `?surface=product-actions-registry`.
- [ ] Registry loads correctly.
- [ ] Closing registry returns to Hub or workspace safely.
- [ ] No console errors on Hub or registry.
- [ ] `appVersion.js` contains `v1.0.134`.
- [ ] Version marker is NOT on BPMN canvas.
- [ ] No backend/schema changes.

### 6. Optional Bounded UX Polish (only if safe)

If you find that Analytics Hub CSS or copy needs minor, bounded improvements:
- You may add scoped CSS classes or adjust existing ones in `frontend/src/styles/tailwind.css`.
- You may adjust text/copy in `ProcessAnalyticsHub.jsx` only if it improves clarity and does not change logic.
- You may add or update test assertions in `ProcessAnalyticsHub.test.mjs` only if they are non-conflicting.
- Do NOT do broad CSS refactor.
- Do NOT change routing logic.
- Do NOT change backend-facing code.

If you make any changes, document them in `WORKER_3_REPORT.md`.

### 7. Tests

Run:
```bash
cd /opt/processmap-test/frontend
npm run build
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPage.test.mjs
```

All must pass. If any fail, document in `WORKER_3_REPORT.md`.

---

## Safety Rules

- **No backend changes.**
- **No DB schema changes.**
- **No BPMN XML mutation.**
- **No Product Actions durable truth changes.**
- **No RAG runtime changes.**
- **No package install.**
- **No commit/push/PR/deploy.**
- Keep changes bounded to independent inspection, documentation, and minor safe UX polish.

---

## Required Reports

Create these files in the contour directory (all in Russian):

1. `WORKER_3_REPORT.md` — summary of independent inspection findings.
2. `RAG_PREFLIGHT_WORKER_3.md` — preflight output.
3. `SOURCE_MAP_WORKER_3.md` — files inspected.
4. `UX_ACCEPTANCE_CRITERIA_REPORT.md` — detailed UX checks and expectations.
5. `PROPERTIES_REGISTRY_PLACEHOLDER_REPORT.md` — proof that Properties Registry is placeholder only.
6. `DATA_SAFETY_REPORT.md` — git diff proof, no backend/BPMN/RAG changes.
7. `RUNTIME_REVIEW_CHECKLIST_FOR_AGENT4.md` — checklist for Agent 4 runtime validation.
8. `WORKER_3_DONE` — empty marker file.

If you are blocked and cannot complete, create `EXEC_PART_2_BLOCKED.md` (NOT global `EXEC_BLOCKED.md`).

After creating all reports, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "feature/process-analytics-hub-and-registry-navigation-v1" worker3
```
