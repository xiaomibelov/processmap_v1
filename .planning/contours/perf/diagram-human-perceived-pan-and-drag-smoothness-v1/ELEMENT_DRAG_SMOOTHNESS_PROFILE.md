# ELEMENT_DRAG_SMOOTHNESS_PROFILE

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Методика:** Native Playwright middle-button pan (simulated canvas pan) + element drag через bpmn-js drag API.

---

## Baseline (v1.0.131)

- Element drag показывал slight jitter.
- При drag запускался `applyPropertiesOverlayDecorForZoomChange` при каждом изменении viewbox.
- Selection sync и decor update происходили через `selection.changed`.

## After (v1.0.132)

- `applyPropertiesOverlayDecorForZoomChange` подавлен при `isCanvasPanningActive()` или `shouldSuppressSideEffectsDuringDrag()`.
- `.fpcDiagramInteracting` активируется и на element drag (через `pointerdown`/`pointerup` на canvas).
- Filter снят во время drag.
- **PUT /bpmn после pointerup** — pre-existing auto-save, не затронут.

---

## Safety

- [x] Нет unintended durable save во время drag.
- [x] Property panel sync не нарушен — просто deferred до pointerup.
- [x] Selection decor восстанавливается после drag.
