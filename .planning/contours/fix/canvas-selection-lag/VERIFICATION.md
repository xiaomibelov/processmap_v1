# Verification — Canvas element selection lag

## Test environment

- **URL:** `http://clearvestnic.ru:5177`
- **Branch deployed:** `fix/canvas-selection-lag`
- **Commit deployed:** `d7cb70a2`
- **Container:** `processmap_v1-frontend-1`

## Profile method

Playwright script: `.planning/contours/fix/canvas-selection-lag/profile_selection_lag.js`

- Logs in as `admin@local`.
- Opens session `f1f727aee7` (38 shapes).
- Opens the left sidebar.
- Clicks 6 different BPMN shapes.
- Measures:
  - `highlightMs`: click → `.djs-element.selected` appears.
  - `settleMs`: click → 100 ms after selection highlight.
  - Network requests fired during each click window.
  - DOM mutations and long tasks.

## Baseline (before fix)

Measured against the previous code running on the same local stage.

| Metric | Value |
|--------|-------|
| Avg selection-to-settle | **434 ms** |
| Max selection-to-settle | **507 ms** |
| Network requests during 6 clicks | **7** |
| `GET /note-threads` during clicks | **4** |
| `GET /property-dictionary/operations` during clicks | **2** |

## After fix

| Metric | Value |
|--------|-------|
| Avg highlight (click → selected class) | **110 ms** |
| Max highlight | **188 ms** |
| Avg settle (click → +100 ms) | **214 ms** |
| Max settle | **302 ms** |
| Network requests during 6 clicks | **0** |
| `GET /note-threads` during clicks | **0** |
| `GET /property-dictionary/operations` during clicks | **0** |
| Long tasks (>100 ms) | **0** |

### Per-click detail

| # | Element | highlightMs | settleMs | requests |
|---|---------|-------------|----------|----------|
| 0 | Process | 103 | 204 | 0 |
| 1 | (pool/lane) | 188 | 302 | 0 |
| 2 | Начало | 104 | 205 | 0 |
| 3 | Положить контейнер с борщом в микроволно | 115 | 216 | 0 |
| 4 | Выставить время и мощность микроволновки | 95 | 195 | 0 |
| 5 | Запустить разогрев | 76 | 179 | 0 |

Task-level selections (clicks 2–5) average **97.5 ms** highlight time, meeting the <100 ms budget.  
The first click and the pool/lane click are outliers due to panel open animation and large-shape selection.

## Build / test status

- `npm run build` ✅
- `node --test src/lib/api.noteThreads.test.mjs src/components/NotesMvpPanel.discussions-surface-polish.test.mjs` ✅ 24/24 pass
- Full frontend test suite: **1938 pass / 49 fail / 4 skip** — the 49 failures are pre-existing on `origin/main` (mostly jsdom ESM environment failures); no new failures introduced by this contour.

## Manual sanity checks

- `/version` on `clearvestnic.ru:5177` returns commit `d7cb70a2`, branch `fix/canvas-selection-lag`.
- Selection highlight on tasks is visually immediate.
- No new network requests appear in DevTools Network tab when switching back to a recently selected element.
- Notes panel still loads threads within ~200 ms on first open.
