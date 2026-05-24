# RUNTIME_EVIDENCE.md — Consolidated Runtime Data

## Source Truth Capture

| Fact | Value |
|------|-------|
| pwd | /opt/processmap-test |
| whoami | root |
| hostname | clearvestnic.ru |
| date | 2026-05-15T16:47:18+00:00 |
| git branch | fix/lockfile-sync-test |
| HEAD | a9a9d9c5f468d9da63415306da6d34dcd605aa0d |
| origin/main | d805e1c64c1107b9e3fe6854e031694bf741b187 |
| API health | `{"ok":true,"status":"ok","redis":...}` |
| Frontend | HTTP/1.1 200 OK (nginx/1.27.5) |

## Browser Environment

- **Playwright version**: 1.60.0
- **Browser**: Chromium (headless)
- **Viewport**: 1440×900
- **Auth**: JWT access token injected via `localStorage.setItem('fpc_auth_access_token', ...)`
- **Token user**: `admin@local` (is_admin=true)

## Test Session

- **Project**: `b1c8a56b6e` (Описание процессов Долгопрудный)
- **Session**: `4c515d1c6e` (wewe)
- **Direct URL**: `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e&tab=diagram`

## Timings (ms)

| Scenario | Metric | Value |
|----------|--------|-------|
| A | Time to diagram-ready | 6,540 |
| A | Time to stable idle | 9,587 |
| B | Analysis→Diagram (avg 3 cycles) | 3,988 |
| B | Diagram→Analysis (avg 3 cycles) | 5,261 |
| B | XML→Diagram (avg 3 cycles) | 4,710 |
| B | Diagram→XML (avg 3 cycles) | 4,217 |
| C | Selection click latency (avg 10 clicks) | 1,450 |
| D | Hover latency (avg 10 hovers) | 471 |
| H | Property panel open latency (avg 5 cycles) | 799 |

## DOM/SVG/Overlay Counts

### Initial Load (Scenario A)
- DOM: 8,025
- SVG: 2,392
- `.djs-overlay`: 17
- `.fpcPropertyOverlay`: 0
- `.fpcFocusDim`: 0
- `.fpcAnalyticsSelected`: 0
- `.djs-bendpoint`: 0
- `.djs-segment-dragger`: 0
- `diagramReady`: true
- `.bpmnLayer--editor`: block
- `.bpmnLayer--diagram`: none

### After Tab Switches (Scenario B)
- DOM: 8,025
- SVG: 2,392
- `.djs-overlay`: 17
- All other counts: same as initial

### After Selection (Scenario C)
- DOM: 8,025 (delta 0)
- SVG: 2,392 (delta 0)
- **Caveat**: Clicks did not register due to Playwright interception

### After Hover (Scenario D)
- DOM: 8,025
- SVG: 2,392
- No change

### After Pan/Zoom (Scenario E)
- DOM: 11,242 (delta +3,217)
- SVG: 5,606 (delta +3,214)
- `.djs-bendpoint`: 664 (new)
- `.djs-segment-dragger`: 254 (new)
- **Caveat**: Synthetic event anomaly; may not reflect real-user pan/zoom

### After Property Panel (Scenario H)
- DOM: 11,242 (post-anomaly state)
- SVG: 5,606
- Panel latency: ~799 ms

### Final State
- DOM: 11,242
- SVG: 5,606
- `.djs-overlay`: 17
- `.fpcPropertyOverlay`: 0
- `.fpcFocusDim`: 0
- `.fpcAnalyticsSelected`: 0
- `.djs-bendpoint`: 664
- `.djs-segment-dragger`: 254

## Network Summary

| Pattern | Count |
|---------|-------|
| PUT `/bpmn` | 0 |
| PATCH `/sessions` | 0 |
| `/bpmn/versions?limit=1` | 4 |
| `/bpmn/versions?limit=50` | 0 |
| `/sessions/{id}` | 1 |
| `/sessions/{id}/bpmn` | 1 |
| Failed requests (>=400) | 1 |
| Auth/presence 401 errors | 0 |

## Console Summary

Total console messages: 4
Errors: 1

- `[error]` Failed to load resource: the server responded with a status of 401 (Unauthorized) — `/api/auth/refresh` (pre-existing, before token injection)
- `[debug]` [LINT] run sid=- profile=mvp issues=0 errors=0 warns=0
- `[debug]` [UI] sidebar.render collapsed=1 class=workspace workspace--leftHidden
- `[debug]` [LINT] run sid=4c515d1c6e profile=mvp issues=61 errors=55 warns=6

## Screenshots Captured

1. `evidence/screenshots/scenario-a-diagram-loaded.png`
2. `evidence/screenshots/scenario-b-after-tab-switch.png`
3. `evidence/screenshots/scenario-c-after-selection.png`
4. `evidence/screenshots/scenario-e-after-pan-zoom.png`

## Raw Data

Full structured results: `evidence/raw-results.json`
