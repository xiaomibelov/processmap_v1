# REVIEWER_PROMPT.md

## Identity
- **Role**: Agent 3 / Reviewer
- **Contour**: `fix/diagram-visible-version-and-large-canvas-lag-v1`
- **Run ID**: `20260515T203759Z-49386`

## Pre-flight
1. Read `PLAN.md`, `EXEC_REPORT.md`, `VISIBLE_VERSION_PROOF.md`, `LARGE_CANVAS_BASELINE.md`, `CANVAS_LAG_ROOT_CAUSE.md`, `RUNTIME_BEFORE_AFTER.md`, `IMPLEMENTATION_NOTES.md`, `VIEWER_FIRST_DESIGN.md` (if exists), `RUNTIME_PROOF_CHECKLIST.md`.
2. Verify source HEAD matches claimed SHA:
   - `git rev-parse HEAD`
3. Verify served assets match local dist:
   - `curl -s "http://clearvestnic.ru:5180/?cb=$(date +%s)" | grep -oE "assets/[^\"' ]*\.(js|css)"`
   - `find frontend/dist/assets -type f | sort`

## Review Section A — Visible Version

1. Open **fresh browser context** on `http://clearvestnic.ru:5180/?cb=<timestamp>`.
2. Locate the visible version marker in UI.
3. Verify it shows:
   - App version (e.g., `v1.0.126`)
   - Short SHA (e.g., `a9a9d9c`)
   - Build timestamp or contour id
4. Take screenshot or write exact textual proof of where it appears and what it says.
5. Verify `/build-info.json` returns matching data.
6. Verify `window.__PROCESSMAP_BUILD_INFO__` returns matching data.
7. Verify the marker is **visible without devtools** — not hidden, not tiny, not requiring console.

**If visible version is missing, insufficient, or only in devtools:**
- `CHANGES_REQUESTED`

## Review Section B — 5180 Served Marker

1. Verify `build-info.json` SHA matches `git rev-parse HEAD`.
2. Verify served `index.html` asset hashes match `frontend/dist/assets/`.
3. Verify gateway container is serving current dist (bind volume or fresh copy).
4. Verify `Last-Modified` or `ETag` indicates current build.

**If 5180 is stale or assets mismatch:**
- `CHANGES_REQUESTED` or `REVIEW_BLOCKED`

## Review Section C — Large Canvas (Playwright Fresh Context)

### Setup
- Navigate to known large session (`wewe / Описание процессов Долгопрудный`).
- Ensure overlays OFF:
  ```js
  document.querySelectorAll('.fpcPropertyOverlay').length === 0
  ```

### Pan/Zoom
- Perform 5-10 pan/zoom cycles.
- Record:
  - Subjective smoothness (laggy / okay / smooth)
  - DOM/SVG counts before/after
  - Any long-task indicators in console

### Selection
- Click 5-10 BPMN elements in analytics/view mode.
- Verify:
  - `.fpcAnalyticsSelected` count is low (1-2)
  - `.djs-bendpoint` count is 0
  - `.djs-segment-dragger` count is 0
  - `.fpcFocusDim` count is 0
  - Property panel opens and updates

### Tab Switch
- Analysis → Diagram → XML → Diagram.
- Verify:
  - `.djs-container` count stays at 1
  - No skeleton flash
  - Time to usable canvas is materially improved or exact bottleneck documented

### Network
- Monitor for:
  - `PUT /bpmn` — must be 0 from view interactions
  - `PATCH /sessions` — must be 0 from view interactions
  - `/bpmn/versions?limit=1` — background polls only, no spam

### Console
- Verify 0 new errors/warnings.

## Review Section D — Viewer-First (if implemented)

1. Verify default view mode does NOT create Modeler/editor affordances:
   - `.djs-bendpoint` = 0
   - `.djs-segment-dragger` = 0
2. Verify edit mode still works (or document why Playwright cannot test it).
3. Verify analytics selection-lite works on Viewer.
4. Verify property panel works.

## Verdict Rules

### CHANGES_REQUESTED if ANY of:
- Visible version marker missing or only accessible via devtools/console/curl.
- 5180 stale (served assets do not match local dist / build-info stale).
- Large no-overlays canvas lag materially not improved.
- Pan/zoom still stutters with no measurable improvement.
- Tab switch still feels like full reload with no documented next bottleneck.
- Selection-lite broken.
- Property panel broken.
- PUT/PATCH triggered by view interactions.
- Versions spam regression.
- New console errors.

### REVIEW_PASS only if ALL of:
- Visible UI marker exists, obvious, and includes version + SHA + timestamp.
- 5180 served marker verified fresh.
- Large no-overlays canvas tested and materially improved.
- Pan/zoom smoother or measured better.
- Tab switch stable or exact next bottleneck documented.
- Selection-lite + property panel work.
- 0 PUT/PATCH from view interactions.
- No versions spam.
- Build/tests pass.
- No scope violations.

## Output

If pass:
- `REVIEW_REPORT.md` — comprehensive review report.
- `REVIEW_PASS` — touch this file.

If changes requested:
- `REVIEW_REPORT.md` — with exact changes requested.
- Do NOT touch `REVIEW_PASS`.
