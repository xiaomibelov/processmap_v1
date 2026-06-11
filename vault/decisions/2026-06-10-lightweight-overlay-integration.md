# Decision: Lightweight Overlay Frontend Integration

## Context
Backend exposes `GET /api/sessions/{sid}/overlays` returning JSON array (872 bytes) vs monolithic XML with embedded foreignObject overlays (216 KB). Goal: reduce payload and render overlays dynamically.

## Decision
1. Feature flag: `window.__FPC_LIGHTWEIGHT_OVERLAYS__` (matches existing `__FPC_*` debug flag convention)
2. When flag is true:
   - `apiGetBpmnXml` called with `includeOverlay: false` → clean XML
   - After `renderViewer`/`renderModeler` complete → `mountLightweightOverlays` fetches JSON via `apiGetOverlays`
   - Overlays mounted via bpmn-js `overlays.add()` with exact x/y/w/h from JSON
3. When flag is false (default): existing behavior unchanged

## Rationale
- Minimal invasion: only 2 files modified, no new modules
- Fallback safety: flag defaults to false, existing path untouched
- Reuses existing bpmn-js overlay API (same mechanism as bottleneck/decor overlays)
- Cleanup integrated into existing `destroyRuntime` lifecycle

## Risks
- Coordinate system: backend returns x/y from SVG foreignObject parsing. Assumed relative to element top-left (bpmn-js overlay convention). Needs browser verification.
- Style mapping: `ovl.style` passed as CSS class string. May need refinement after visual test.
- Double rendering: if backend still embeds overlays when `includeOverlay` omitted, could see duplicates. Mitigated by explicit `includeOverlay: false`.

## Alternatives rejected
- Separate overlay renderer module: too much boilerplate for a feature flag
- Modify `applyInterviewDecor`: wrong abstraction — lightweight overlays are FPC annotations, not interview UI
- Hook-based approach: would complicate the imperative render pipeline
