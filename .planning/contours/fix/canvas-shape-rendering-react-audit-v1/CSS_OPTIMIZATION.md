# CSS Optimization Report — fix/canvas-shape-rendering-react-audit-v1

## Что изменено

**Файл:** `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`

### До

```css
.bpmnStage .djs-visual path,
.bpmnStage .djs-visual circle,
.bpmnStage .djs-visual polygon,
.bpmnStage .djs-visual rect {
  shape-rendering: geometricPrecision;
}
```

### После

```css
.bpmnStage .djs-container svg {
  shape-rendering: optimizeSpeed;
}

.bpmnStage .djs-container svg .djs-connection {
  vector-effect: non-scaling-stroke;
}

.bpmnStage .djs-container svg .djs-shape {
  shape-rendering: crispEdges;
}
```

## Почему это безопасно

1. **Чистый CSS** — нет JS, нет манипуляций DOM.
2. **Без изменений позиционирования** — не трогаем `transform`, `left`, `top`, и т.д.
3. **Без promotion слоёв** — нет `will-change`, `translateZ(0)`, `contain`.
4. **`shape-rendering` — hint** — браузер игнорирует при неподдержке, fallback безопасен.
5. **Overlays не затронуты** — оверлеи — HTML-элементы (`div`), живущие вне SVG, правила на `svg` их не касаются.
6. **Library CSS intact** — `diagram-js.css` из `bpmn-js` сохраняет `geometricPrecision` для `.djs-selection-outline`, `.djs-lasso-overlay`, `.djs-resizer-visual`, `.djs-crosshair` (мелкие UI-элементы, их немного).

## Проверка на конфликты

- Поиск `will-change` / `contain` / `translateZ` на `.djs-container` во всех `*.css` в `frontend/src` — **конфликтов не найдено**.
- Откаченный GPU-compositing контур (`fix/canvas-gpu-compositing-zoom-simplification-v1`) не оставил следов в CSS.

## Проверка bundle

```bash
curl -s http://localhost:5177/assets/index-5Y2ZzVWA.css | grep -oE "shape-rendering:[^;}]+|vector-effect:[^;}]+" | sort | uniq -c
```

Результат:
```
      1 shape-rendering:crispEdges
      4 shape-rendering:geometricPrecision  ← из diagram-js.css (UI outlines)
      1 shape-rendering:optimizeSpeed
      1 vector-effect:non-scaling-stroke
```

✅ Наши правила присутствуют в served bundle.
