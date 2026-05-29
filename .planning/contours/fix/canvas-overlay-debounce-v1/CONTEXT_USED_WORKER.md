# Context Used — Worker

**Контур**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Agent**: Agent 2 / Worker  
**Дата**: 2026-05-28

---

## RAG Preflight

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "fix/canvas-overlay-debounce-v1" --area "worker context" --format md --top-k 5
```

**Key facts**:
- RAG is read-only suggestion layer; forbidden to auto-mutate code
- Agent 3 Reviewer must verify fresh :5180 runtime for UI/runtime work
- Diagram performance review must test real mouse drag, not only synthetic zoom/click
- No PR/merge/deploy without explicit user command

**Decisions confirmed**:
- Bounded scope respected — только overlay debounce, никакого viewport culling

---

## Obsidian Context

### `Diagram Property Overlays Performance Audit.md`
- Property overlays: +34.5% DOM nodes (+2770), 180 `.fpcPropertyOverlay` контейнеров
- P1 recommendation #5: "Coalesce overlay triggers with requestAnimationFrame in useBpmnSettledDecorFanout"
- P1 recommendation #3 (viewport-cull overlays): **rejected** per user non-goals

### `Diagram Baseline No Overlays Canvas Profile.md`
- Element selection triggers +3200 nodes, +40% SVG/DOM inflation
- `useBpmnSettledDecorFanout.js` — properties fanout fires unconditionally
- Decision: verify `useBpmnSettledDecorFanout` as primary target; do NOT touch `applySelectionFocusDecor`

---

## GSD Context

- `gsd` binary: `/opt/processmap-test/bin/gsd`
- No active GSD workspace/roadmap in runtime context
- Planning proceeds with standalone contour artifacts

---

## Implementation Decisions Changed

| Decision | Источник | Изменение |
|----------|----------|-----------|
| Использовать bpmn-js `deferUpdate: true` | Анализ `diagram-js/lib/core/Canvas.js` | Добавлено как дополнительный слой оптимизации (300 мс debounce на viewbox.changed) |
| CSS `visibility: hidden` вместо `display: none` | Анализ `diagram-js/lib/features/overlays/Overlays.js` | bpmn-js `show()/hide()` манипулируют только `display`; `visibility` перекрывает без `!important` |
| Не monkey-patch `Overlays.show()` | Анализ рисков | Хрупко при обновлении bpmn-js; CSS + eventBus listener надёжнее |
| Debounce 150 мс | PLAN.md Option 1 | Совпадает с требованием; trailing edge |
