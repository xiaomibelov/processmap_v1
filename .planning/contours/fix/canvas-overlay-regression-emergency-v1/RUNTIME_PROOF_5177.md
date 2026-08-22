# RUNTIME_PROOF_5177 — fix/canvas-overlay-regression-emergency-v1

**Run ID**: `20260528T224900Z-21407`  
**Date**: 2026-05-28T23:16–23:19 UTC

---

## 1. Bundle Evidence

### CSS bundle — GPU compositing absent
```bash
$ curl -s http://localhost:5177/assets/index-aLeHdavW.css | grep -oE 'pan-active|zoom-simplified|zoom-minimal|translateZ\(0\)|contain:'
# (empty — none of the GPU/zoom patterns found)
```

Only `will-change` occurrence: `.interviewPathsVirtualRow{will-change:transform}` — unrelated to bpmn-js canvas.

### JS bundle — GPU hooks absent
```bash
$ curl -s http://localhost:5177/assets/index-YgoK3RTA.js | grep -oE 'bindGpuCompositingAndZoomHooks|updateZoomClass|GPU_PAN_ACTIVE_CLASS'
# (empty — none found)
```

### JS bundle — deferUpdate preserved
```bash
$ curl -s http://localhost:5177/assets/index-YgoK3RTA.js | grep -o 'deferUpdate:!0'
deferUpdate:!0
deferUpdate:!0
```

### Bundle freshness
```
HTTP/1.1 200 OK
Content-Length: 3325326
Last-Modified: Thu, 28 May 2026 23:07:21 GMT
ETag: "6a18caa9-32bd8e"
```

---

## 2. Browser Evidence

### Page
- URL: `http://localhost:5177/app?project=70d1c5ffaf&session=9a8030f136`
- Diagram: `Perf test session` (122 shapes, 118 labels)

### Computed styles (DevTools evaluation)
```json
{
  "containerStyles": {
    "willChange": "auto",
    "contain": "none",
    "transform": "none"
  },
  "overlayContainerStyles": {
    "display": "block",
    "visibility": "visible"
  },
  "labelCount": 118,
  "labelVisibility": [
    { "display": "block", "visibility": "visible", "opacity": "1" },
    ...
  ]
}
```

### Pan test
- Drag performed on SVG canvas: `(422, 344) → (572, 494)`
- Result: labels remained visible, no errors.

### Zoom test
- Zoom-in button clicked.
- Result: labels remained visible, no errors.

### Scrubber test
- Drag performed on `.bpmnViewportScrubberThumb`: `(122.9, Y) → (272.9, Y)`
- Result: scrubber responded correctly.

### Console
- Errors: 0
- Warnings: 0

### Screenshots
- `page-2026-05-28T23-17-41-587Z.png` — diagram at initial load
- `page-2026-05-28T23-19-40-094Z.png` — diagram after pan + zoom + scrubber

---

## 3. Source Truth

```bash
$ git diff HEAD -- frontend/src/styles/legacy/legacy_bpmn.css
# (no diff)

$ git diff HEAD -- frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js
# (no diff)

$ git diff HEAD -- frontend/src/components/process/BpmnStage.jsx
# deferUpdate: true added (stable debounce contour)

$ git diff HEAD -- frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js
# deferUpdate: true added (stable debounce contour)
```
