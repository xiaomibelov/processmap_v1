# CONTEXT USED — Worker

**Contour:** `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID:** `20260529T000236Z-27528`  
**Agent:** Agent 2 / Worker  
**Generated:** 2026-05-29T00:14:22Z

---

## RAG Preflight

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "fix/canvas-shape-rendering-react-audit-v1" --area "worker context" --format md --top-k 5
```

### Key facts used

1. **Previous contours:**
   - `fix/canvas-viewport-culling-v1`: REVERTED — shapes disappeared on viewport exit.
   - `fix/canvas-overlay-debounce-v1`: REVIEW_PASS — FPS ~58.7, perceived lag remained.
   - `fix/canvas-gpu-compositing-zoom-simplification-v1`: REVERTED — overlays disappeared due to `will-change: transform` + `contain: layout paint` on `.djs-container`.

2. **Bottleneck:** 3754 SVG nodes on 428-element diagram, React bundle ~95% CPU during drag.

3. **Decisions taken:**
   - Strictly avoid `will-change`/`contain`/`translateZ` on `.djs-container`.
   - CSS-only `shape-rendering` is safe next step.
   - React re-render audit is critical.

4. **Source files verified by planner:**
   - `BpmnStage.jsx` — no direct `viewbox` state setter in top grep hits.
   - `wireBpmnStageRuntimeEvents.js` — overlay debounce present, no GPU compositing remains.
   - `02-06-bpmn-dark-theme.css` — contains `shape-rendering: geometricPrecision` on `.bpmnStage .djs-container svg` (по факту — на `.djs-visual` элементы).

---

## Obsidian / GSD Context

- PLAN.md — прочитан полностью перед началом работы.
- WORKER_PROMPT.md — прочитан полностью.
- RAG_PREFLIGHT_PLANNER.md — прочитан полностью.

### Context, изменивший решения

1. **Runtime mismatch (:5177)** — RAG preflight упоминал mismatch (dev server из `/app` вместо `/opt/processmap-test/frontend`). При расследовании выяснилось, что:
   - `:5177` обслуживается nginx-контейнером (`processmap-test-gateway-1`).
   - Vite-контейнер (`processmap-test-frontend-1`) работает в фоне, но nginx serve static files напрямую из `/usr/share/nginx/html`.
   - Для обновления runtime потребовалось скопировать `dist/` в nginx-контейнер.

2. **Library CSS (`diagram-js.css`)** — содержит 4 правила `shape-rendering: geometricPrecision` для `.djs-outline`, `.djs-lasso-overlay`, `.djs-resizer-visual`, `.djs-crosshair`. Это UI-элементы, их оставляем как есть. Наши правила нацелены на основные фигуры и connections.

3. **React re-render** — гипотеза PLAN о `setState` в `BpmnStage.jsx` не подтвердилась. Компонент уже использует ref-based pub/sub и защищён от re-render через `memo` + stable props в родительской цепочке.

---

## Источники

| Файл | Как использовался |
|------|-------------------|
| `PLAN.md` | Scope, acceptance criteria, forbidden list |
| `WORKER_PROMPT.md` | Implementation details, report requirements |
| `RAG_PREFLIGHT_PLANNER.md` | Prior contour outcomes, source file hints |
| `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` | CSS target for shape-rendering change |
| `frontend/src/components/process/BpmnStage.jsx` | React audit target |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Event listener audit |
| `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js` | Parent re-render analysis |
| `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` | Props stability verification |
