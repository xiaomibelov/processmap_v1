# CSS_SOURCE_MAP — fix/diagram-interaction-mode-visual-regression-v1

**Run ID:** 20260516T224839Z-35866

---

## Первичный источник серого fill

**Файл:** `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`
**Строки:** 62–91 (`.dark .bpmnStage` CSS variables), 15–19 (global task fill rule)

```css
.dark .bpmnStage {
  --bpmn-task-fill: rgba(15, 22, 38, 0.72);   /* ← слишком тёмный */
  --bpmn-task-stroke: rgba(236, 245, 255, 0.78);
  ...
}

.bpmnCanvas .djs-element:not(...) .djs-visual > :is(rect, circle, ellipse, polygon) {
  fill: color-mix(in srgb, var(--bpmn-task-fill) 20%, transparent) !important;  /* ← 20% даёт низкую непрозрачность */
  stroke: color-mix(in srgb, var(--bpmn-task-stroke) 85%, transparent) !important;
}
```

**Результат:** `rgba(15,22,38,0.72) * 20%` = `rgba(15,22,38,0.144)` — тёмно-серый fill.

**Фикс:**
- `--bpmn-task-fill` → `rgba(255, 255, 255, 0.92)`
- `--bpmn-task-stroke` → `rgba(30, 41, 59, 0.8)`
- `color-mix` percentage fill → `92%`

---

## Источник белого flash при pan

**Файл 1:** `frontend/src/styles/legacy/legacy_bpmn.css`  
**Строки:** 38–48

```css
.bpmnCanvas .djs-container .viewport,
.bpmnCanvas .viewport {
  filter: brightness(.88) contrast(.96);   /* ← делает всё серее */
}

.djs-container.fpcDiagramInteracting .viewport,
.fpcDiagramInteracting .bpmnCanvas .djs-container .viewport,
.fpcDiagramInteracting .bpmnCanvas .viewport {
  filter: none;                            /* ← резкий скачок */
  will-change: transform;
}
```

**Файл 2:** `frontend/src/styles/app/06-final-structure.css`  
**Строки:** 164–174 (до правки)

```css
.bpmnCanvas .djs-container .viewport,
.bpmnCanvas .viewport{
  filter: brightness(.88) contrast(.96);
}

.fpcDiagramInteracting .bpmnCanvas .djs-container .viewport,
.fpcDiagramInteracting .bpmnCanvas .viewport{
  filter: none;
  will-change: transform;
}
```

**Фикс:** Удалить базовый `filter` полностью. Оставить только `will-change: transform` в interaction mode.

---

## shape-rendering crispEdges

**Файл:** `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`  
**Строки:** 66–72

```css
.fpcDiagramInteracting .djs-visual path,
.fpcDiagramInteracting .djs-visual circle,
.fpcDiagramInteracting .djs-visual polygon,
.fpcDiagramInteracting .djs-visual rect {
  shape-rendering: crispEdges !important;
}
```

**Примечание:** Селектор НЕ включает `text`, поэтому текст не затронут. Возможен микро-jump у фигур при pan. Оставлен без изменений в рамках Part 1.

---

## Перекрытие правил (specificity battle)

Правила в `02-06-bpmn-dark-theme.css` (уже изменены в рабочей ветке на белый fill) не применяются, потому что `05-02-bpmn-text-contrast.css` имеет:
- Более специфичный селектор (`:not(...)` chain)
- `!important`
- Загружается позже в `legacy_bpmn.css`

Поэтому исправление `02-06-bpmn-dark-theme.css` недостаточно — ключевой файл: `05-02-bpmn-text-contrast.css`.
