# PERFORMANCE_BEFORE_AFTER — perf/diagram-eventbus-listener-and-raf-coalescing-v1

## Baseline (Before Changes)

Measured from the current deployed build (same `origin/main` baseline, previous contours applied):

| Metric | Value |
|--------|-------|
| Total DOM nodes (overlays ON, default viewport) | ~9,269 |
| `.djs-overlay` | 87 |
| `.fpcPropertyOverlay` | 70 |
| `canvas.viewbox.changed` handler calls per pan/zoom frame | 1 direct call to `applyPropertiesOverlayDecorForZoomChange` per event |
| `readySignal` re-computation | Every render (new string identity) |
| Fanout effect re-fires from `readySignal` churn | All 5 fanout hooks re-fire on unrelated renders |
| EventBus listener cleanup | Only native `contextmenu` had cleanup; all `eventBus.on` registrations leaked on instance replacement |

## After Changes

| Metric | Value |
|--------|-------|
| Total DOM nodes (overlays ON, default viewport) | ~9,269–9,304 (stable) |
| `.djs-overlay` | 87 (stable across all scenarios) |
| `.fpcPropertyOverlay` | 70 (stable across all scenarios) |
| `canvas.viewbox.changed` overlay refresh | Coalesced to at most 1 per animation frame via `requestAnimationFrame` |
| `readySignal` re-computation | Only when `viewerInstanceKey` or `modelerInstanceKey` changes (new instance creation) |
| Fanout effect re-fires from `readySignal` churn | Eliminated; fanouts now fire only when actual data deps or instance readiness changes |
| EventBus listener cleanup | Every `eventBus.on` has a paired `eventBus.off` in the returned cleanup function; RAF token also cancelled |

## Qualitative Observations

- **Pan/zoom responsiveness:** Overlay refresh is now deferred to the next animation frame. During fast pan/zoom bursts, the handler no longer directly triggers expensive `applyPropertiesOverlayDecorForZoomChange` on every event. The existing zoom-bucket signature guard inside `applyPropertiesOverlayDecorForZoomChange` still applies, but it is now invoked at most once per frame.
- **Selection/hover:** No visible change in responsiveness (no regression). Overlay counts remain stable.
- **Tab switch:** No duplicate overlays observed. Pre-existing behavior where overlay visibility resets on tab switch is unchanged.
- **Stress loop:** After 3 cycles of pan/zoom + selection, DOM counts remain bounded. No memory leak pattern detected.

## Network / Mutation Safety

| Request Type | Before | After |
|--------------|--------|-------|
| `PUT /bpmn` from pan/zoom/selection/hover/tab | 0 (guarded) | 0 (guarded, unchanged) |
| `PATCH /sessions` from same scenarios | 0 (guarded) | 0 (guarded, unchanged) |
| `GET /bpmn/versions?limit=1` burst on tab switch | 0 (deduped) | 0 (deduped, unchanged) |

## Risks / Limitations

- RAF coalescing introduces a 1-frame delay for overlay refresh. If this causes visible misalignment during very fast pan, the coalescing could be tightened (e.g., combine with a `setTimeout(..., 0)` fallback), but current testing showed no visible issues.
- The `readySignal` stabilization relies on `viewerInstanceMetaRef.current.id` and `modelerInstanceMetaRef.current.id` being incremented on every new instance. This is true for the current `ensureViewer` / `ensureModeler` implementation.
- `useBpmnSettledDecorFanout.test.mjs` could not be executed due to a pre-existing Node 18 / jsdom 28 ESM incompatibility. The test logic (re-applies decor when runtime becomes ready) is preserved by the change because `readySignal` still transitions from `0:0` to `1:1` when instances are assigned.
