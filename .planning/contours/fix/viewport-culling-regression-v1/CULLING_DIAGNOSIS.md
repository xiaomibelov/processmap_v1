# Диагноз: viewport culling regression

## Контур
`fix/viewport-culling-regression-v1`

## Симптомы
1. Pan canvas вправо → левая часть диаграммы уходит за viewport → **ВСЕ shapes исчезают**.
2. Остаются только overlays (labels, badges).
3. Scrubber (minimap) работает некорректно.
4. **Регресс** после внедрения `fix/canvas-viewport-culling-v1`.

## Корневые причины

### 1. Destructive DOM removal (`gfx.remove()`)
Файл: `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js`

```js
// Строка ~220
gfx.remove();
detachedMap.set(el.id, { gfx, parent, nextSibling });
```

Culling **удаляет** SVG gfx-группы из DOM через нативный `Node.remove()`.
При восстановлении (`insertBefore` / `appendChild`) элемент возвращается,
но **bpmn-js теряет внутренние ссылки** на эти узлы:
- `elementRegistry.getGraphics(el)` может вернуть узел, который больше не участвует в internal render pipeline bpmn-js.
- bpmn-js при следующем `viewbox.changed` может пересоздать gfx, не найдя старый в DOM → дублирование или ghost-элементы.

### 2. Race condition с bpmn-js render cycle
- `scheduleCull()` вызывается на каждый `canvas.viewbox.changed`.
- bpmn-js сам обновляет viewport transform и перерисовывает элементы.
- Если culling удаляет gfx **во время** или **сразу после** bpmn-js render, bpmn-js не находит ожидаемые DOM-узлы и падает в неконсистентное состояние.

### 3. Неправильная работа `getShapeLayer` / `getConnectionLayer`
```js
container.querySelector(".djs-layer-shape")
```
Если селектор не совпадает с фактической DOM-структурой bpmn-js,
`parent` для `appendChild` оказывается `null` → элемент не восстанавливается.

### 4. Scrubber
Scrubber не сломан напрямую culling-кодом, но **перестаёт работать из-за исчезновения shapes**:
- Slider рассчитывает `contentWidth` / `viewboxWidth` из `canvasApi.getViewportSnapshot()`.
- Когда shapes исчезают, пользователь не может pan вручную (нет target для drag), scrubber кажется "зависшим".

## Вывод
Culling реализован через **destructive DOM mutation** (`remove()`), что нарушает invariant bpmn-js:
> "Все gfx, зарегистрированные в elementRegistry, всегда присутствуют в DOM."

**bpmn-js уже имеет встроенную оптимизацию:** он не рендерит off-screen shapes в SVG.
Дополнительное culling на уровне DOM избыточно и destructive.
