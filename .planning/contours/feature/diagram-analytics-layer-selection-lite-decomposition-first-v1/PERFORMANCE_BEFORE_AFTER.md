# PERFORMANCE_BEFORE_AFTER — feature/diagram-analytics-layer-selection-lite-decomposition-first-v1

**Run ID**: `20260515T125319Z-23963`  
**Executor**: Agent 2 / Executor  
**Date**: 2026-05-15

---

## Environment

| Item | Value |
|------|-------|
| Session | `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`) |
| Runtime | `http://clearvestnic.ru:5180` |
| Browser | Playwright (Chromium) |
| Overlays | OFF (`include_overlay=0`) |

---

## Baseline (Before Any Selection)

| Metric | Value |
|--------|-------|
| Total DOM nodes | 8,025 |
| SVG nodes | 2,392 |
| `.fpcPropertyOverlay` | 0 |
| `.fpcFocusDim` | 0 |
| `.djs-bendpoint` | 0 |
| `.djs-segment-dragger` | 0 |
| `.djs-resizer` | 0 |
| `.fpcElementSelected` | 0 |
| `.fpcAnalyticsSelected` | 0 |

---

## After Selection — Edit Mode (Legacy Behavior, Verified Still Works)

Triggered by: `eventBus.fire("drag.start")` → auto-switches to edit mode → click `Activity_1c5b5zb`

| Metric | Value | Delta from Baseline |
|--------|-------|---------------------|
| Total DOM nodes | 11,449 | **+3,424** |
| SVG nodes | 5,604 | **+3,212** |
| `.fpcPropertyOverlay` | 0 | 0 |
| `.fpcFocusDim` | 424 | +424 |
| `.djs-bendpoint` | 660 | +660 |
| `.djs-segment-dragger` | 251 | +251 |
| `.djs-resizer` | 8 | +8 |
| `.fpcElementSelected` | 1 | +1 |
| `.fpcAnalyticsSelected` | 0 | 0 |

**Notes:** Edit mode behavior is fully preserved. DOM/SVG inflation matches the pre-contour baseline audit (which reported +3,198 to +3,423 total DOM).

---

## After Selection — Analytics Mode (New Behavior, Default)

Triggered by: fresh Diagram tab load (default analytics mode) → click `Activity_1c5b5zb`

| Metric | Value | Delta from Baseline |
|--------|-------|---------------------|
| Total DOM nodes | 8,263 | **+238** |
| SVG nodes | 2,418 | **+26** |
| `.fpcPropertyOverlay` | 0 | 0 |
| `.fpcFocusDim` | 0 | **0** |
| `.djs-bendpoint` | 0 | **0** |
| `.djs-segment-dragger` | 0 | **0** |
| `.djs-resizer` | 8 | +8 |
| `.fpcElementSelected` | 0 | 0 |
| `.fpcAnalyticsSelected` | 1 | +1 |

**Notes:**
- Mass dimming (`fpcFocusDim`) is completely eliminated in analytics mode.
- Connection editing handles (`djs-bendpoint`, `djs-segment-dragger`) are not created in analytics mode.
- Total DOM inflation reduced from **+3,424** to **+238** (≈ 93% reduction).
- SVG inflation reduced from **+3,212** to **+26** (≈ 99% reduction).

---

## Comparison Summary

| Scenario | Total DOM Δ | SVG Δ | fpcFocusDim | B endpoints | Segment Draggers |
|----------|-------------|-------|-------------|-------------|------------------|
| Baseline (no click) | 0 | 0 | 0 | 0 | 0 |
| Edit mode (legacy) | **+3,424** | **+3,212** | 424 | 660 | 251 |
| Analytics mode (new) | **+238** | **+26** | **0** | **0** | **0** |
| Improvement | **-93%** | **-99%** | **-100%** | **-100%** | **-100%** |

---

## Tab Switch Stability

| Scenario | Total DOM | SVG | Verdict |
|----------|-----------|-----|---------|
| Analysis → Diagram | 8,025 → 8,025 | 2,392 → 2,392 | ✅ Stable |
| XML → Diagram | 8,025 → 8,025 | 2,392 → 2,392 | ✅ Stable |

---

## Network Safety

| Interaction | PUT `/bpmn` | PATCH `/sessions` | `versions?limit=1` |
|-------------|-------------|-------------------|--------------------|
| Selection in analytics mode | 0 | 0 | Background polls only |
| Selection in edit mode | 0 | 0 | Background polls only |
| Pan / zoom | 0 | 0 | Background polls only |
| Tab switch | 0 | 0 | Background polls only |

All verdicts: **PASS**
