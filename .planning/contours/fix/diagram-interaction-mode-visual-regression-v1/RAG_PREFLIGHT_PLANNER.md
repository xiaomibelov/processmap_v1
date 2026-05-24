# RAG Preflight — Planner

**Контур:** `fix/diagram-interaction-mode-visual-regression-v1`  
**Роль:** planner  
**Запрос:** Diagram interaction mode visual regression task fill gray bold typography white during pan drag CSS BPMN theme  
**Время:** 2026-05-16T22:50:44.635Z

---

## Команды

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "fix/diagram-interaction-mode-visual-regression-v1" \
  --area "Diagram interaction mode visual regression task fill gray bold typography white during pan drag CSS BPMN theme" \
  --format md \
  --top-k 12
```

---

## Ключевые факты

### User Rejections / Ручные наблюдения
- **[critical]** `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`: Formal REVIEW_PASS не соответствовал user-visible решению lag. → Реальный drag мышью обязателен.
- **[medium]** `fix/diagram-real-drag-performance-and-engine-decomposition-v1`: Маркер версии на canvas был отклонён пользователем. → Маркер вне canvas.
- **[critical]** `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`: Reviewer тестировал synthetic zoom/click вместо реального drag. → Реальный drag мышью.

### Bottlenecks
- [Frontend] React bundle потребляет ~95% CPU при drag-взаимодействиях на диаграмме. → next: `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`
- [Diagram] Diagram drag lag остался после нескольких performance-контуров. → next: `perf/process-stage-baseline-jank-v1`

### Релевантные решения
- RAG — read-only suggestion/context layer. Запрещено авто-мутировать код.
- Маркер версии НЕ на canvas.
- Version/update row должен инкрементироваться видимо.

### Релевантные контуры
- `perf/diagram-svg-css-repaint-reduction-v1`: 43 drop-shadow rules убраны/снижены, 4 box-shadow rules снижены. Primary interaction paths больше не триггерят expensive `filter: drop-shadow(...)`.
- `fix/diagram-real-drag-performance-and-engine-decomposition-v1`: Option C — Disable analytics selection/focus updates during active drag.
- `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`: REVIEW_PASS с замечанием по element-drag interaction mode.

---

## Поддерживающие документы

1. **Bounded fix options** (`fix/diagram-real-drag-performance-and-engine-decomposition-v1/PLAN.md`) — score 36.010
2. **Primary path — Option C: Simplify CSS effects** (`perf/diagram-svg-css-repaint-reduction-v1/PLAN.md`) — score 34.187
3. **CSS Impact Summary** (`perf/diagram-svg-css-repaint-reduction-v1/REVIEW_REPORT.md`) — 43 drop-shadow rules reduced, visual semantics preserved via stroke color.
4. **RUNTIME_PROOF_CHECKLIST.md** (`fix/diagram-real-drag-performance-and-engine-decomposition-v1`) — чеклист реального drag.

---

## Как RAG изменил план

- Усилил требование **реального drag-теста** (не synthetic).
- Подтвердил, что предыдущие CSS-оптимизации (drop-shadow removal) были правильными и их **нельзя слепо откатывать**.
- Указал на связь между `.fpcDiagramInteracting`, `filter` и `shape-rendering` — вероятные источники визуальной регрессии.
- Напомнил про версию вне canvas и видимый footer.
