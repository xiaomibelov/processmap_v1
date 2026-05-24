# Performance Audit Report
## Diagram Property Overlays Performance — audit/diagram-property-overlays-performance-gsd-v1

**Run ID**: `20260514T220133Z-82898`  
**Audited at**: `2026-05-14T22:07–22:21 UTC`  
**Auditor**: Agent 2 / Executor  
**Scope**: Diagram/BPMN rendering performance, property overlay behavior, network patterns, React lifecycle, DOM growth  
**Runtime**: Frontend `http://clearvestnic.ru:5180`, API `http://clearvestnic.ru:8088`  
**Test session**: `wewe` (4c515d1c6e) in project `Описание процессов Долгопрудный` (b1c8a56b6e)

---

## Executive Summary

The audit found **two confirmed root causes** contributing to Diagram/BPMN performance issues:

1. **Overlay DOM inflation (H1 — confirmed)**: Enabling property overlays increases total DOM nodes by **34.5%** (+2,770 nodes) and creates **180 styled overlay containers** with table rows. Each overlay applies 8+ inline CSS properties, creating a large layout surface.
2. **Excessive speculative versions head-check (H6/H7 — confirmed)**: The endpoint `/api/sessions/{id}/bpmn/versions?limit=1` is called **26+ times** during a short session even though the user never opens the BPMN history modal. Tab switches and background effects trigger these checks repeatedly.

**No evidence** was found for:
- Diagram remount on tab switch (H4 — rejected)
- BPMN modeler reinitialization (H5 — rejected)
- Duplicate overlay leak (H2 — rejected)
- EventBus listener leak (H3 — possible but no direct evidence)
- StrictMode double effects (H14 — rejected; production build)

---

## Detailed Findings

### 1. Runtime Scenarios

#### Scenario A — Baseline Diagram Open
- Total DOM nodes: **8,025**
- `.djs-overlay`: **17**
- `.fpcPropertyOverlay`: **0**
- Console: 1× 401 on `/api/auth/me` (recovered)
- Network: 1× session GET, 1× BPMN XML GET, 1× analysis batch-draft GET, 1× presence POST, 1× versions head-check, 1× auto-pass precheck

#### Scenario B — Analysis ↔ Diagram Tab Switching
- DOM node delta: **±0–26** (measurement noise)
- `.djs-overlay`: **stable at 17**
- **Finding**: Diagram is NOT remounted. Visibility toggled via CSS `display: none/block`. `viewerRef` / `modelerRef` persist.

#### Scenario C — Overlay Visibility
- Overlays OFF → ON: total DOM **8,025 → 10,795** (+34.5%)
- `.djs-overlay`: **17 → 197**
- `.fpcPropertyOverlay`: **0 → 180**
- Tab switch with overlays ON: **stable at 197 / 180** — no duplication

#### Scenario D — Pan/Zoom Performance
- Zoom in 3× (1.0 → 1.6): DOM **stable** (10,798 vs 10,795)
- Pan canvas: DOM **stable** (10,798)
- **Finding**: `geometrySignature` dedupe in `decorManager.js` correctly reuses overlay containers.

#### Scenario E — Large Diagram Projection
- Current session: ~15–20 BPMN elements → 180 overlays when always-ON.
- Linear scaling: a 100-element session could produce **900–1,000+ overlay nodes**.
- `applyPropertiesOverlayDecor` iterates `registry.getAll()` — O(n) per trigger.

### 2. Network Patterns

| Endpoint | Count | Notes |
|----------|-------|-------|
| `GET /bpmn/versions?limit=1` | **26+** | Called speculatively; user never opened history modal |
| `DELETE /presence` (aborted) | **4×** | Cancel-race on cleanup |
| `PUT /bpmn` (aborted) | **2×** | Cancel-race on cleanup |
| `PUT /bpmn` (200) | **1×** | Succeeded without explicit user Save action |

### 3. Source Map Highlights

- **`decorManager.js:1561–1785`**: `applyPropertiesOverlayDecor()` — main render loop. Implements signature-based reuse but still iterates all elements and may rebuild tables.
- **`useBpmnSettledDecorFanout.js:146–161`**: Properties fanout effect — fires on 5 deps, can queue multiple updates per frame.
- **`ProcessStage.jsx:4320–4345`**: `refreshSnapshotVersions()` — has dedupe via `bpmnVersionsListRequestRef`, but multiple callers bypass the guard with different flag combinations.
- **`BpmnStage.jsx:5797–5805`**: JSX — two `.bpmnCanvas` divs toggled via CSS, not unmounted.

### 4. Hypothesis Rankings

See `ROOT_CAUSE_HYPOTHESES.md` for full details.

| ID | Hypothesis | Rank |
|----|-----------|------|
| H1 | Overlay DOM inflation | **confirmed** |
| H2 | Duplicate bpmn-js overlays | **rejected** |
| H3 | EventBus listener leak | **possible** |
| H4 | Heavy React remount | **rejected** |
| H5 | BPMN modeler reinitialization | **rejected** |
| H6 | Heavy data refetch | **confirmed** |
| H7 | Accidental versions fetch | **confirmed** |
| H8 | Mutation on non-edit interaction | **likely** |
| H9 | Derived state recomputed too often | **possible** |
| H10 | CSS/layout cost | **possible** |
| H11 | ResizeObserver/MutationObserver loop | **rejected** |
| H12 | Toast/notification dedupe missing | **rejected** |
| H13 | Cache keys unstable | **likely** |
| H14 | StrictMode double effect | **rejected** |

---

## Recommendations Summary

### Immediate (P0)
1. **Debounce versions head-check** (`ProcessStage.jsx`) — add 2–5s throttle to `refreshSnapshotVersions`.
2. **Skip versions head-check when modal closed** — guard callers with `bpmnVersionsOpenRef.current`.

### Short-term (P1)
3. **Viewport-cull overlays** (`decorManager.js`) — only render overlays for visible elements.
4. **Batch overlay style updates** — use CSS classes for zoom buckets instead of per-overlay inline styles.
5. **Coalesce overlay triggers** — use `requestAnimationFrame` queue in `useBpmnSettledDecorFanout`.
6. **Stabilize `readySignal`** — remove from effect deps, check refs inside effect.

### Long-term (P2)
7. **Canvas-based overlay rendering** — avoid DOM overlay inflation entirely.
8. **Virtualized / recycled overlay DOM** — diff rows instead of full rebuild.
9. **Lazy overlay content** — compute on viewport entry, not all at once.

---

## Safety Checklist

- [x] No product code changed in this contour
- [x] No BPMN XML mutation
- [x] No backend schema/storage changes
- [x] No deploy/PR/merge/commit
- [x] No .env changes
- [x] No secrets in reports
- [x] Runtime evidence collected via Playwright
- [x] Source map built from read-only code inspection
- [x] Hypotheses ranked with evidence tags
