# RUNTIME_PROOF_CHECKLIST — Analytics UI/UX + Fields + Excel Export

**Environment:** `https://clearvestnic.ru:5177`  
**Contour:** `premium-urgent-task-analytics-ui-ux-addi-mqdo4sea`

---

## 1. Pre-deploy source checks

| # | Check | Command / Action | Expected result |
|---|-------|------------------|-----------------|
| 1 | Branch | `cd /opt/processmap-test && git branch --show-current` | `feature/analytics-fields-export` |
| 2 | HEAD | `git rev-parse HEAD` | matches `4e8c0939b4c03ebc21297edb179866c61a1d75e1` before changes, new hash after worker commits |
| 3 | Diff stat | `git diff --stat -- frontend/src/lib/api.js frontend/src/features/analytics frontend/src/styles/tailwind.css frontend/src/features/analytics/AnalyticsDashboards.test.mjs` | Only intended files changed |
| 4 | Tests (working repo) | `cd /opt/processmap-test/frontend && node --test src/features/analytics/AnalyticsDashboards.test.mjs src/features/analytics/dashboardModel.test.mjs src/features/analytics/useAnalyticsRouteState.test.mjs` | All pass |
| 5 | Build (working repo) | `cd /opt/processmap-test/frontend && npm run build` | Completes without errors |
| 6 | Gateway sync | Compare `/root/processmap_v1/frontend/src/features/analytics` with `/opt/processmap-test/frontend/src/features/analytics` | Files aligned |
| 7 | Build (gateway repo) | `cd /root/processmap_v1/frontend && npm ci && npm run build` | Completes without errors |

---

## 2. Deploy commands

Use the existing deploy script or manual nginx flow:

```bash
cd /opt/processmap-test
cat deploy/deploy.sh | head -n 40   # read the entrypoint, do not run blindly
# Typical manual flow (confirm with project conventions):
# cd /root/processmap_v1
# ./deploy/deploy.sh --env test --host clearvestnic.ru:5177
```

After deploy, run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://clearvestnic.ru:5177/
```

Expected: `200`

---

## 3. Runtime evidence to collect

### 3.1 Session dashboard

- [ ] Screenshot of Session Analytics Dashboard showing **Duration**, **Status**, **Created By** columns.
- [ ] Screenshot showing filter inputs for the new columns.
- [ ] Screenshot showing sort indicator (▲/▼) on one of the headers.

### 3.2 Project dashboard

- [ ] Screenshot of Project Analytics Dashboard showing **Total Sessions**, **Last Activity**, **Owner** columns.
- [ ] Screenshot showing filter inputs for the new columns.
- [ ] Screenshot showing sort indicator on one of the headers.

### 3.3 Workspace dashboard

- [ ] Screenshot of Workspace Analytics Dashboard summary table showing **Member Count**, **Project Count**, **Storage Used**.
- [ ] Screenshot showing filter inputs for the summary fields.
- [ ] Screenshot showing sort indicator on one of the headers.

### 3.4 Excel export

- [ ] Screenshot of the "Export to Excel" button on each dashboard.
- [ ] Screenshot of browser download bar with filename `processmap-analytics-{surface}-{YYYY-MM-DD}.xlsx`.
- [ ] Screenshot of the opened workbook showing `Metadata` and `Data` sheets.
- [ ] Screenshot of the `Metadata` sheet containing visible columns and active filters.

### 3.5 Filters / empty state

- [ ] Screenshot of active filter chips.
- [ ] Screenshot of "no matching filters" empty state showing applied filters + "Clear filters" button.
- [ ] Screenshot after clicking "Clear filters" showing all rows again.

### 3.6 Responsive

- [ ] Screenshot at 375px width showing table collapsed to cards.
- [ ] Screenshot at 1280px width showing normal table with horizontal scroll if needed.

### 3.7 Overlay navigation safety

- [ ] Screenshot/screen recording showing opening analytics from top bar and closing it back to the previous view without errors.

---

## 4. Verdict format

Write `RUNTIME_PROOF_5177.md` with the following sections:

```markdown
# Runtime Proof — clearvestnic.ru:5177

## Deploy
- Deploy command: ...
- HTTP 200 check: ...

## Session dashboard
- Screenshot: ...
- Verdict: PASS / FAIL

## Project dashboard
- Screenshot: ...
- Verdict: PASS / FAIL

## Workspace dashboard
- Screenshot: ...
- Verdict: PASS / FAIL

## Excel export
- Screenshot: ...
- Verdict: PASS / FAIL

## Filters / empty state
- Screenshot: ...
- Verdict: PASS / FAIL

## Responsive
- Screenshot: ...
- Verdict: PASS / FAIL

## Navigation safety
- Screenshot/recording: ...
- Verdict: PASS / FAIL

## Overall
PASS / FAIL
```

---

## 5. Sign-off

- [ ] All screenshots saved to a known location (e.g. `docs/screenshots/analytics-fields-export/` or attached to `RUNTIME_PROOF_5177.md`).
- [ ] `RUNTIME_PROOF_5177.md` created in the contour directory.
- [ ] No secrets or session tokens visible in any screenshot.
