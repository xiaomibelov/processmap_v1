# Counts Before/After

## Baseline (Diagram loaded, no selection, overlays OFF)
| Metric | Count |
|--------|-------|
| Total DOM nodes | 8025 |
| SVG nodes | 2392 |
| .djs-overlay | 17 |
| .fpcPropertyOverlay | 0 |
| [data-element-id] | 276 |
| .djs-shape | 162 |
| .djs-connection | 112 |
| .bpmnCanvas | 2 |
| .djs-container | 1 |
| .djs-bendpoint | 0 |
| .fpcFocusDim | 0 |
| .selected | 3 |

## After Selection (click 1: Event_1duwp2k)
| Metric | Count | Δ |
|--------|-------|---|
| Total DOM nodes | 11226 | +3201 |
| SVG nodes | 5578 | +3186 |
| .djs-overlay | 17 | 0 |
| .fpcPropertyOverlay | 0 | 0 |
| [data-element-id] | 276 | 0 |
| .djs-bendpoint | 916 | +916 |
| .fpcFocusDim | ~907 | +907 |
| .selected | 4 | +1 |

## After Selection (click 10: DataStoreReference_0bkhcag)
| Metric | Count | Δ from baseline |
|--------|-------|-----------------|
| Total DOM nodes | 11223 | +3198 |
| SVG nodes | 5579 | +3187 |
| .djs-overlay | 17 | 0 |
| .fpcPropertyOverlay | 0 | 0 |
| [data-element-id] | 276 | 0 |
| .djs-bendpoint | 916 | +916 |
| .fpcFocusDim | ~907 | +907 |
| .selected | 4 | +1 |

## After Tab Return (Diagram → XML → Diagram)
| Metric | Count | Δ from baseline |
|--------|-------|-----------------|
| Total DOM nodes | 7994 | -31 |
| SVG nodes | 2383 | -9 |
| .djs-overlay | 17 | 0 |
| .fpcPropertyOverlay | 0 | 0 |
| [data-element-id] | 276 | 0 |
| .djs-bendpoint | 0 | 0 |
| .fpcFocusDim | 0 | 0 |
| .selected | 3 | 0 |

## Pan/Zoom Cycles
| Phase | Total | SVG | .djs-overlay | .fpcPropertyOverlay |
|-------|-------|-----|--------------|---------------------|
| Before pan | 8025 | 2392 | 17 | 0 |
| After pan +50px | 8025 | 2392 | 17 | 0 |
| After pan back | 8025 | 2392 | 17 | 0 |
| After zoom in | 8025 | 2392 | 17 | 0 |
| After zoom out | 8025 | 2392 | 17 | 0 |

## Hover Cycles
| Phase | Total | SVG | .djs-overlay | .fpcPropertyOverlay |
|-------|-------|-----|--------------|---------------------|
| Before hover | 11192 | 5570 | 17 | 0 |
| After hover 1–10 | 11192 | 5570 | 17 | 0 |
