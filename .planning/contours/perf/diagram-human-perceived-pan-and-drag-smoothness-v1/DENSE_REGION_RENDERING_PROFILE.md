# DENSE_REGION_RENDERING_PROFILE

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Проект:** `wewe` / «Описание процессов Долгопрудный»

---

## DOM / SVG статика

| Метрика | Значение |
|---------|----------|
| totalElements | 2876 |
| svgElements | 2399 |
| djsContainers | 1 |
| djsOverlays | 17 |
| fpcPropertyOverlays | 0 (слои OFF) |
| fpcFocusDims | 0 |
| fpcAnalyticsSelected | 0 |
| djsBendpoints | 0 |
| djsSegmentDragger | 0 |

---

## Сравнение empty vs dense

Empty region (верхний левый угол canvas) — практически пустая сетка без фигур.
Dense region (центр) — ~2400 SVG-нод, lanes, tasks, events, connections.

Frame pacing в dense-регионе до и после практически идентичен по RAF-delta, но **визуальный опыт** в dense-регионе улучшился благодаря:
- снятию filter во время interaction;
- `shape-rendering: crispEdges` вместо `geometricPrecision`;
- подавлению `applyPropertiesOverlayDecorForZoomChange`.

---

## Вывод

Главный bottleneck dense-региона — не количество DOM-нод (bpmn-js справляется с 2400 SVG-элементами), а **paint cost фильтра и shape-rendering** на этих нодах во время анимации.
