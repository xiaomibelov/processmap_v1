# Before / After Measurements — fix/canvas-shape-rendering-react-audit-v1

## Методология

- Инструмент: `measureFPS()` (3-секундный pan большой диаграммы).
- Диаграмма: 428 элементов (3754 SVG-узла).
- Маленькая диаграмма: контроль на отсутствие регрессии.

## Базовая линия (до изменений)

| Метрика | Значение | Источник |
|---------|----------|----------|
| Pan FPS (большая диаграмма) | ~30 | PLAN §4, контур `fix/canvas-overlay-debounce-v1` (после отката GPU compositing) |
| React re-renders `BpmnStage` при pan | 0 (подтверждено аудитом) | REACT_AUDIT.md |
| Overlays при pan | Видны, корректно позиционированы | PLAN §4 |

## После изменений

| Метрика | Значение | Статус |
|---------|----------|--------|
| Pan FPS (большая диаграмма) | Ожидается ≥ 38–40 | ⚠️ Требует ручного измерения |
| React re-renders `BpmnStage` при pan | 0 (подтверждено аудитом) | ✅ Подтверждено |
| Overlays при pan | Видны, корректно позиционированы | ✅ CSS не затрагивает overlays |
| Маленькая диаграмма | Ожидается 60 FPS, без регрессии | ⚠️ Требует ручного измерения |

## Почему измерения не проведены автоматически

1. **FPS-измерение** требует реального браузера с загруженной большой диаграммой и ручным/программным pan. Headless-измерение в CI не воспроизводит perceived lag.
2. **React DevTools «Highlight updates»** требует браузерного расширения и интерактивного pan мышью.
3. Оба пункта входят в acceptance criteria **Agent 3 (Reviewer)**.

## Инструкция для ручного измерения

```javascript
// В консоли браузера на открытой большой диаграмме
function measureFPS() {
  let frames = 0;
  const start = performance.now();
  function tick() {
    frames++;
    if (performance.now() - start < 3000) {
      requestAnimationFrame(tick);
    } else {
      console.log("FPS:", frames / 3);
    }
  }
  requestAnimationFrame(tick);
}
measureFPS();
// Затем — 3-секундный pan мышью по canvas.
```

React DevTools:
1. Открыть Components → Settings → «Highlight updates when components render».
2. Pan canvas — `.djs-container` и `BpmnStage` **не должны** мигать.
