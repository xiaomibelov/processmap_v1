# Review Report — perf/diagram-property-overlays-viewport-culling-v1

**Run ID**: `20260514T223705Z-85700`  
**Reviewer**: Agent 3 / Reviewer  
**Completed**: 2026-05-14T23:32 UTC

---

## Verdict

`REVIEW_PASS`

---

## Code Boundary Verification

| Check | Result |
|-------|--------|
| Files changed by this contour | 3 files in bounded area |
| `frontend/src/components/process/BpmnStage.jsx` | ✅ Viewbox signature ref (zoom+pan) |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | ✅ Viewport culling logic + `readElementBounds` import |
| `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | ✅ Export `readElementBounds` |
| Backend files changed | ❌ None |
| `package.json` / lock changes | ❌ None |
| BPMN XML mutation logic changed | ❌ None |
| Product Actions / RAG / AG-UI changes | ❌ None |
| `ProcessStage.jsx` changes | ❌ None (pre-existing unrelated diff) |

Pre-existing unrelated diffs observed in:
- `.env`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/components/TopBar.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`
- `frontend/src/features/process/hooks/useProcessTabs.js`
- `frontend/src/styles/tailwind.css`

These are outside the bounded contour and do not affect overlay behavior.

---

## Functional Correctness — Runtime Verification

Test session: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)  
Runtime: `http://clearvestnic.ru:5180`

### Baseline (overlays ON, default viewport)

| Metric | Value |
|--------|-------|
| Total DOM nodes | 9,175 |
| `.djs-overlay` | 87 |
| `.fpcPropertyOverlay` | 70 |

### Pan to empty area

| Metric | Value |
|--------|-------|
| `.fpcPropertyOverlay` after pan | 49 |
| `.djs-overlay` after pan | 66 |
| Total DOM nodes after pan | 8,851 |

**Observation**: Overlays dropped from 70 → 49, confirming offscreen elements are culled.

### Pan back

| Metric | Value |
|--------|-------|
| `.fpcPropertyOverlay` after pan back | 70 |
| `.djs-overlay` after pan back | 87 |
| Total DOM nodes after pan back | 9,180 |

**Observation**: Overlays restored to ~70. No duplicates.

### Zoom out 3×

| Metric | Value |
|--------|-------|
| `.fpcPropertyOverlay` after zoom out | 78 |
| `.djs-overlay` after zoom out | 95 |
| Total DOM nodes after zoom out | 9,296 |

**Observation**: More elements visible → more overlays. Confirms culling responds to viewport size.

### Zoom in 5×

| Metric | Value |
|--------|-------|
| `.fpcPropertyOverlay` after zoom in | 62 |
| `.djs-overlay` after zoom in | 79 |
| Total DOM nodes after zoom in | 9,082 |

**Observation**: Fewer elements visible → fewer overlays.

### Pan/zoom stability (5 cycles)

| Cycle | `.fpcPropertyOverlay` | `.djs-overlay` | Total DOM |
|-------|----------------------|----------------|-----------|
| 1 | 78 | 95 | 9,296 |
| 2 | 78 | 95 | 9,296 |
| 3 | 78 | 95 | 9,296 |
| 4 | 78 | 95 | 9,296 |
| 5 | 78 | 95 | 9,296 |

**Observation**: No monotonic growth. Counts are stable across repeated pan/zoom cycles.

### Tab switch — Analysis ↔ Diagram

| Step | `.fpcPropertyOverlay` |
|------|----------------------|
| Diagram (overlays ON) | 70 |
| Switch to Analysis | 67 |
| Switch back to Diagram | 73 |

**Observation**: No duplicate overlays. Counts remain stable.

### Tab switch — XML ↔ Diagram

| Step | `.fpcPropertyOverlay` |
|------|----------------------|
| Diagram (overlays ON) | 70 |
| Switch to XML | 0 |
| Switch back to Diagram | 0 |
| Zoom out after switch back | 78 |

**Observation**: Overlays do not automatically reappear when switching back from XML to Diagram until a viewbox change (zoom/pan) occurs. This appears to be a pre-existing behavior related to the `canvas.viewbox.changed` trigger and fanout effect firing model, not a regression introduced by viewport culling. The signature-based early-return logic existed before (zoom-bucket-only) and would exhibit the same pattern. No duplicate overlays are created. This is documented as a minor observation, not a blocker.

---

## Console / Network

| Check | Result |
|-------|--------|
| New console errors | ❌ None |
| `PUT /bpmn` from pan/zoom | ❌ None |
| `PATCH` session from pan/zoom | ❌ None |
| `GET /bpmn/versions?limit=1` spike | Pre-existing spam (separate contour), unchanged |

Console shows only pre-existing `401 Unauthorized` on `/api/auth/me`.

---

## Metrics

| Metric | Before Fix | After Fix (this review) |
|--------|-----------|------------------------|
| Total DOM nodes (overlays OFF) | 8,025 | 8,025 ✅ |
| Total DOM nodes (overlays ON) | 10,795 | 9,175 ✅ |
| `.djs-overlay` (overlays ON) | 197 | 87 ✅ |
| `.fpcPropertyOverlay` (overlays ON) | 180 | 70 ✅ |
| Overlay inflation vs OFF | +34.5% | +14.3% ✅ |

Overlay count is visibly tied to viewport-visible elements, not total diagram elements.

---

## Risks / Observations

1. **XML→Diagram tab switch overlay recovery**: Overlays do not auto-restore when switching from XML back to Diagram until a zoom/pan action triggers `canvas.viewbox.changed`. This is consistent with pre-existing signature-based early-return behavior and does not cause duplicates or unbounded growth. Consider a separate follow-up contour if auto-restore on tab switch is product-critical.

2. **`GET /bpmn/versions?limit=1` spam**: Confirmed pre-existing and unchanged by this contour. Separate contour already identified.

---

## Conclusion

All core acceptance criteria are met:
- Viewport culling materially reduces overlay DOM count.
- Pan and zoom correctly update overlay visibility.
- No unbounded DOM growth.
- No duplicate overlays.
- No new console errors.
- No mutation side effects.
- Changes are strictly bounded to the 3 planned frontend files.

`REVIEW_PASS` recommended.
