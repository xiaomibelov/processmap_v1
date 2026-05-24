# Agent 4 / Reviewer Prompt

**Contour:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Run ID:** `20260517T084454Z-64313`  
**Role:** Agent 4 / Reviewer  
**Language rule:** Write REVIEW_REPORT.md in Russian. Agent prompts stay in English.

---

## Your Mission

Perform independent cross-AI review of Worker 2 and Worker 3 outputs. Produce a REVIEW_REPORT.md with verdict REVIEW_PASS or CHANGES_REQUESTED.

You are the **only** agent allowed to validate Worker 2 implementation.

---

## Wait Conditions

Do NOT start review until ALL of the following exist:
- `WORKER_2_DONE`
- `WORKER_3_DONE`
- `WORKER_2_REPORT.md`
- `WORKER_3_REPORT.md`

If any are missing, wait and re-check.

---

## Mandatory Preflight

Before reviewing, run:

```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
test -x /opt/processmap-test/bin/gsd && echo "GSD_OK" || echo "GSD_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "TOOLS_OK" || echo "TOOLS_MISSING"
```

Then run reviewer RAG preflight:
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "feature/process-analytics-hub-and-registry-navigation-v1" \
  --query "Analytics Hub review rules Product Actions Registry not top-level Properties Registry placeholder no product runtime regression version bump 4-agent independent workers" \
  --format md \
  --top-k 10
```

Save output to `RAG_PREFLIGHT_REVIEWER_4.md` in the contour directory.

Include GSD discipline and RAG preflight summary in REVIEW_REPORT.md.

---

## Review Checklist

### 1. Read Worker Reports
- Read `WORKER_2_REPORT.md` and all Worker 2 sub-reports.
- Read `WORKER_3_REPORT.md` and all Worker 3 sub-reports.

### 2. Independent File Inspection
- Read `ProcessAnalyticsHub.jsx` and `ProcessAnalyticsHub.test.mjs`.
- Read changes to `processMapRouteModel.js`.
- Read changes to `ProcessStage.jsx` (focus on analytics route wiring).
- Read changes to `WorkspaceExplorer.jsx` (focus on analytics entry points).
- Read changes to `AppShell.jsx` and `TopBar.jsx`.
- Read `appVersion.js` version bump.
- Read any CSS changes.

### 3. Build & Tests
```bash
cd /opt/processmap-test/frontend
npm run build
```

```bash
cd /opt/processmap-test/frontend
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPage.test.mjs
```

All must pass.

### 4. Fresh Runtime Proof
- `curl -I http://clearvestnic.ru:5180` → HTTP 200.
- Open `http://clearvestnic.ru:5180/app?surface=analytics` in browser.
- Verify:
  - [ ] Title "Аналитика" is visible.
  - [ ] Description text is visible.
  - [ ] Dashboard summary cards exist without fake numbers.
  - [ ] Module card "Реестр действий" exists with "Открыть" CTA.
  - [ ] Module card "Реестр свойств" exists with "Скоро" status.
  - [ ] Module card "Дашборды" exists.
  - [ ] Close/back button is visible and functional.
- Click "Открыть" on "Реестр действий".
- Verify registry loads.
- Verify closing registry returns to Hub or workspace safely.
- Check browser console for errors.

### 5. Version / Build Info
- Verify `appVersion.js` contains `currentVersion: "v1.0.134"`.
- Verify `build-info.json` is valid and contains expected fields.
- Verify version marker is NOT on BPMN canvas.

### 6. Product Runtime Safety
- `git diff --name-only` must NOT contain:
  - `backend/app/` files
  - `.env`
  - `package.json` / `requirements.txt`
  - BPMN XML files
  - RAG runtime files (unless explicitly in scope)
- Confirm no Product Actions durable truth mutations.
- Confirm no schema changes.

### 7. UX Criteria
- [ ] Analytics Hub is visually clear.
- [ ] Cards have borders and clear sections.
- [ ] No scattered filters on landing page.
- [ ] No immediate giant table at root.
- [ ] No user trap.
- [ ] No fake dashboard data presented as real.

### 8. Validate Worker 3 Independence
- Verify `WORKER_3_REPORT.md` does NOT contain language such as "validated Worker 2", "waited for WORKER_2_DONE", or "reviewed Worker 2 implementation".
- Verify `WORKER_3_PROMPT.md` was designed as an independent package.
- Verify Worker 3 produced its own source map and evidence without depending on Worker 2 reports.

---

## Verdict Rules

**REVIEW_PASS** is allowed ONLY if ALL of the following are true:
1. Worker 2 and Worker 3 reports exist and are coherent.
2. Analytics Hub page exists and renders correctly at `?surface=analytics`.
3. "Реестр действий" is a module/card inside Analytics Hub.
4. "Реестр свойств" placeholder exists and is clearly marked as future.
5. Dashboard summary area exists without fake numbers.
6. Existing Product Actions Registry remains reachable.
7. Close/back/navigation behavior is clear and functional.
8. Version bumped to `v1.0.134`.
9. `build-info.json` valid.
10. No backend/schema changes.
11. No BPMN XML mutation.
12. No console errors introduced.
13. Build and tests pass.
14. Runtime proof on 5180 collected.
15. Worker 3 performed independent work (did not falsely depend on Worker 2).

**CHANGES_REQUESTED** if ANY of the following:
- Analytics Hub missing or does not render.
- "Реестр действий" is still the only top-level analytics surface.
- "Реестр свойств" missing entirely.
- Fake dashboard numbers presented as real.
- User cannot close/return.
- Backend/schema changes without explicit justification.
- Build or tests fail.
- Console errors on Hub or registry.
- Version not bumped.
- Worker 3 did not perform independent work (e.g., only copied Worker 2 report).

---

## Output

Create `REVIEW_REPORT.md` in the contour directory, written in Russian.

Structure:
1. Reviewer GSD Discipline
2. RAG Preflight Summary
3. Worker 2 Review
4. Worker 3 Review
5. Independent Validation Summary
6. Acceptance Criteria Verification (table)
7. Risks and Limitations
8. Final Verdict (REVIEW_PASS or CHANGES_REQUESTED)

If REVIEW_PASS, also create empty marker file `REVIEW_PASS`.
If CHANGES_REQUESTED, also create `REVIEW_BLOCKED.md` with specific required fixes.

After review, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "feature/process-analytics-hub-and-registry-navigation-v1" reviewer
```
