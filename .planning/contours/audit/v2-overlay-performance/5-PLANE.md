# 5-Plane Analysis — V2 Overlay Performance Audit

## 1. Code plane

**What the repo actually contains:**

- V2 overlays are imperative DOM created by `overlayLifecycleManager.js`. It walks the full bpmn-js `elementRegistry` and adds one `.fpc-overlay-v2-host` per matching element.
- There is no viewport culling; off-screen elements get overlay nodes too.
- `mount()` always `clear()`s existing overlays before re-adding, even for a pure expansion toggle.
- `BpmnStage.jsx:4601-4617` remounts overlays only when the JSON signature of `extractOverlaysFromBpmn(inst, v2OverlaysEnabled)` changes. If the overlay list is identical for `enabled=false` and `enabled=true`, the toggle does not remount.
- `patchOverlayPanPerf.js` skips the O(n) `_updateOverlaysVisibilty()` call during pan/zoom, but only when "show overlays during pan" is OFF.
- `ProcessStageDiagramControls.jsx` exposes a toolbar button that enables "show overlays during pan/zoom".

**Intent vs. served mismatch:**

- User expects V2 overlays to appear reliably when the toggle is enabled and to stay interactive while panning.
- Code serves correct rendering in some cases, but with large diagrams the per-frame overlay update pass drops FPS below 10.

## 2. Workspace plane

**Branch/checkout:**

- Audit branch: `main`.
- Base equals `origin/main` at `41abd486...`.
- Working tree is clean except for the audit contour and temporary debugging files.

**Isolation:**

- The fix contour will touch only frontend overlay lifecycle, diffing/culling logic, and the BpmnStage remount effect.
- No overlap with the BPMN V2 properties sidebar fix that was merged earlier.

## 3. Data plane

**Side effects:**

- V2 overlays are read-only decorations derived from `camunda:properties` / `bpmn:extensionElements`.
- No backend writes are triggered by overlay rendering.
- No data migration needed.

## 4. Environment / compose plane

**Stage stack:**

- Deployed via `.github/workflows/deploy-stage.yml`.
- Compose project `processmap_stage` using `docker-compose.yml` + `docker-compose.stage.yml`.

**What must be true after fixes:**

- Frontend build must succeed with `npm run build`.
- Automated FPS benchmark (`scripts/e2e/audit_v2_overlay_performance.mjs`) must show min FPS ≥ 30 for pan/drag with 200 V2 overlays and "show overlays during pan" enabled.
- Existing e2e verification scripts must still pass.

## 5. Serving plane

**Stage runtime at audit time:**

- `/version` returned commit `41abd486`, build time `2026-06-30T11:50:23Z`, env `stage`.
- `/api/health` was not queried; no backend changes are expected.

**What to verify after deploy:**

- Re-run `scripts/e2e/audit_v2_overlay_performance.mjs` against `clearvestnic.ru:5177`.
- Confirm V2 overlay hosts are visible after toggling "Показывать все V2-оверлеи свойств".
- Confirm pan/drag min FPS stays above the 10 FPS threshold and ideally above 30 FPS.
- Confirm no regression in `scripts/e2e/verify_bpmn_v2_properties_sidebar.mjs`.

## Risk matrix

| Change | Risk | Mitigation |
|--------|------|------------|
| Viewport culling in overlay mount | Low | Pure rendering optimization; keep fallback for zero-viewport edge cases. |
| Diff overlay list instead of clear-all | Medium | Must correctly remove orphaned hosts and preserve event listeners/hover state. Add targeted e2e. |
| CSS-class-only expand toggle | Low | Only touches already-mounted hosts. |
| Include `v2OverlaysEnabled` in remount signature | Low | One-line dependency change; ensures toggle always triggers remount. |
| Throttle visibility pass during pan | Medium | Must not break "show overlays during pan" UX; keep root visible, batch DOM writes. |

## Go/no-go

- **Code plane:** GO — root cause is isolated to imperative overlay lifecycle and remount signature.
- **Workspace plane:** GO — changes are frontend-only and isolated.
- **Data plane:** GO — no migrations or API contract changes.
- **Env/compose plane:** GO — no infra changes.
- **Serving plane:** GO — can be verified with the existing automated FPS script after deploy.
