# LAYERS_PANEL_VERIFICATION.md

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`

---

## Статус: PARTIAL

Полноценная проверка панели Layers требует Chrome DevTools в интерактивном режиме с реальным mouse drag. Playwright-MCP не предоставляет доступ к DevTools Layers panel.

## Что удалось проверить автоматически

### 1. Computed styles (Playwright JS eval)

```
svgWillChange: "transform"
svgTransform:  "matrix(1, 0, 0, 1, 0, 0)"
```

- `matrix(1, 0, 0, 1, 0, 0)` — computed value от `translateZ(0)`
- Это подтверждает, что браузер применил 3D-transform и создал compositor layer

### 2. CSS rule presence

В загруженном stylesheet `index-CvjW-o7z.css` найдены правила:

```css
.bpmnStage .djs-container svg, .bpmnStage .djs-canvas svg {
  will-change: transform;
  transform: translateZ(0px);
}
```

### 3. Классы переключаются

- `zoom-full` при загрузке ✓
- `zoom-simplified` после zoom out ✓

## Что требует ручной проверки (Agent 3 Reviewer)

1. Открыть Chrome DevTools → More Tools → Layers
2. Начать pan на большой диаграмме
3. Убедиться, что `.djs-container` или его SVG появляются как отдельный compositor layer
4. Убедиться, что layer count растёт во время pan

## Рекомендация Reviewer

Использовать Chrome DevTools Performance + Layers во время реального drag жеста.
