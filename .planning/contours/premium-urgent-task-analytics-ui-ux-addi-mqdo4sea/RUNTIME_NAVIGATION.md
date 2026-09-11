# RUNTIME_NAVIGATION — Analytics UI/UX + Fields + Excel Export

**Test environment:** `https://clearvestnic.ru:5177`  
**Contour:** `premium-urgent-task-analytics-ui-ux-addi-mqdo4sea`

---

## 1. How to reach the analytics surfaces

1. Open `https://clearvestnic.ru:5177/` in a browser.
2. Authenticate if the Auth guard redirects to `/login`.
3. After login you should land on `/app` (workspace view).
4. Open a **session**, **project**, or stay at **workspace** level.
5. Click the analytics button in the top bar (`data-testid="topbar-analytics-button"`) or use the analytics tab navigation.
6. The URL surface parameter controls which dashboard is shown:
   - `?surface=analytics` → Analytics hub
   - `?surface=dashboards` → Analytics dashboards dispatcher
   - When `sessionId` is present → Session Analytics Dashboard
   - When `projectId` is present (no session) → Project Analytics Dashboard
   - Otherwise → Workspace Analytics Dashboard

Direct test URLs (replace `{workspace_id}`, `{project_id}`, `{session_id}` with real IDs from the environment):

```text
https://clearvestnic.ru:5177/app?workspace={workspace_id}&surface=dashboards
https://clearvestnic.ru:5177/app?project={project_id}&surface=dashboards
https://clearvestnic.ru:5177/app?session={session_id}&surface=dashboards
```

---

## 2. What to verify on each surface

### Session Analytics Dashboard

- Path: when `sessionId` is passed to `AnalyticsDashboards`.
- New registry table columns:
  - **Duration**
  - **Status**
  - **Created By**
- Sortable headers (click toggles ▲/▼).
- Filter inputs/dropdowns for Status and Created By (and Duration after the fix).
- "Export to Excel" button top-right of the table section.

### Project Analytics Dashboard

- Path: when `projectId` is passed to `AnalyticsDashboards`.
- New columns in the "Последние сессии" table:
  - **Total Sessions**
  - **Last Activity**
  - **Owner**
- Sortable headers.
- Filter inputs for Last Activity, Owner, Total Sessions (after fix).
- "Export to Excel" button.

### Workspace Analytics Dashboard

- Path: default when no project/session.
- New summary table fields:
  - **Member Count**
  - **Project Count**
  - **Storage Used**
- Sortable headers.
- Filter inputs for all three fields (after fix).
- "Export to Excel" button in the summary section.

---

## 3. Export verification

1. Apply one or more filters.
2. Click **Export to Excel**.
3. Confirm downloaded file name matches:
   ```text
   processmap-analytics-{surface}-{YYYY-MM-DD}.xlsx
   ```
4. Open the workbook and confirm:
   - Sheet `Metadata` contains surface, generatedAt, row count, visible columns, filters.
   - Sheet `Data` contains the same columns shown in the UI and the filtered/sorted rows.

---

## 4. Responsive check

1. Open DevTools → Device Toolbar.
2. Set viewport width to **375px** (or any <768px).
3. Confirm each table row renders as a stacked card with label/value pairs.
4. Set viewport width to **1280px**.
5. Confirm the table renders normally and is horizontally scrollable if content overflows.

---

## 5. Safety check

- After opening analytics, you must still be able to close it and return to the workspace/project/session view without errors.
- The top-bar analytics button and overlay tabs must remain functional.
- No full-page reload should be required to switch analytics surfaces.
