# SMOOTHNESS_ROOT_CAUSE

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`

---

## Гипотезы и результаты тестирования

### H1. Визуальный джиттер вызван стоимостью SVG repaint/composite в dense-областях

**Частично подтверждено.**  
Frame pacing (RAF delta) показывает, что main thread не перегружен JS. Однако `filter: brightness(.88) contrast(.96)` на `.viewport` принудительно вызывает полный repaint + filter re-composite всей SVG-группы при каждом изменении transform. В dense-диаграмме (2400 SVG-нод) это создаёт визуальное отставание холста от курсора.

### H2. Pointer-follow latency вызван cadence обновления transform bpmn-js

**Не подтверждено.**  
bpmn-js обновляет transform синхронно в ответ на `pointermove`. Задержка не в cadence, а в том, что browser тратит время на paint/composite после обновления transform.

### H3. Несущественные side-эффекты всё ещё выполняются во время pan/drag

**Подтверждено.**  
`canvas.viewbox.changed` вызывал `applyPropertiesOverlayDecorForZoomChange`, который при изменении zoom-bucket итерировал все элементы диаграммы и перестраивал overlays. Это происходило даже во время active pan. Guard добавлен.

### H4. CSS/SVG-эффекты повышают стоимость paint во время interaction

**Подтверждено — главный root cause.**  
- `filter: brightness(.88) contrast(.96)` на viewport — expensive during animation.
- `shape-rendering: geometricPrecision` — точнее, но дороже в rasterization при движении.

### H5. Рендеринг текста/штрихов в большом SVG вызывает frame drops в dense-областях

**Не подтверждено как главный bottleneck.**  
Текст влияет, но filter оказывает большее влияние. Убирание filter дало заметное субъективное улучшение.

### H6. React имеет микро-рендеры во время pointer movement

**Не подтверждено в данном контексте.**  
v1.0.131 уже добавил memo-границы и useStableDraft. React baseline jank был снижен.

### H7. Playwright long-task metrics неадекватны для human smoothness

**Подтверждено.**  
Long-task metrics не отражают paint/composite cost. Нужны именно frame pacing + subjective testing.

### H8. Element drag имеет другой bottleneck, чем canvas pan

**Частично подтверждено.**  
Element drag использует `dragging` модуль bpmn-js (события `drag.start`/`drag.cleanup`), в то время как canvas pan использует `moveCanvas` (без событий). Guard `isCanvasPanningActive` покрывает pan; `shouldSuppressSideEffectsDuringDrag` покрывает element drag.

### H9. Оставшаяся проблема требует interaction-mode optimization или альтернативный read-only viewer

**Не подтверждено как необходимость в данном контуре.**  
Bounded frontend-фикс (CSS + suppression) дал материальное улучшение. Если пользователь всё ещё недоволен — следующий контур может исследовать `content-visibility` или WebGL viewer spike.

---

## Ранжирование root causes

1. **H4 (CSS filter + shape-rendering)** — highest impact, lowest risk fix.
2. **H3 (side-effects during pan)** — medium impact, bounded JS fix.
3. **H1 (SVG paint cost)** — следствие H4.
