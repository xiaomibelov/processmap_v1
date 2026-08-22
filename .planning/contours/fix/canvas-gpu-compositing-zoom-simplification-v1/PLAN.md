# PLAN — Оптимизация pan BPMN-холста через GPU-композитинг и упрощение фигур по zoom

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Запуск**: `20260528T210002Z-13339`  
**Статус**: Готов к исполнению  
**Язык отчётов**: Русский  
**Язык промптов агентов**: Английский

---

## 1. Контекст

### Предыдущие попытки
- `audit/canvas-performance-diagnosis-v1`: подтверждён узкое место — создание DOM/SVG (3754 узла на диаграмме из 428 элементов, FPS ~30 при pan).
- `fix/canvas-viewport-culling-v1`: **ОТКАЧЕН** — фигуры исчезали при выходе из viewport, скруббер сломался.
- `fix/canvas-overlay-debounce-v1`: REVIEW_PASS (FPS ~50 измерено), но пользователь сообщает «Лаги не убрались» — воспринимаемое запаздывание остаётся.

### Новая гипотеза
Лаг **НЕ от overlay-updates**, а от **CPU paint/composite** стоимости 3754 SVG-узлов каждый кадр pan. Даже при всех узлах в DOM браузер перерисовывает слишком много на каждом кадре. Debounce оверлеев поднял FPS до ~50, но pan по-прежнему ощущается «дерганным», потому что браузер делает полный repaint SVG-слоя.

### Доказательства
- Audit: 3754 SVG-ноды, FPS ~30.
- Debounce contour: overlay updates убраны, FPS ~50, но воспринимаемый лаг остался.
- Obsidian audit H5: «CSS/SVG repaint cost dominates» — высокая уверенность.

---

## 2. Стратегия исправления (два независимых механизма)

### A. CSS GPU Compositing (основной, низкий риск, высокий эффект)
Заставить браузер использовать GPU-слой для всего SVG-холста во время pan:

```css
.djs-container svg,
.djs-canvas svg {
  will-change: transform;
  transform: translateZ(0);
}

.djs-canvas.pan-active {
  will-change: transform;
  contain: layout paint;
}
```

JS-хук: добавлять/убирать класс `pan-active` по событиям bpmn-js (`canvas.viewbox.changing` / `canvas.viewbox.changed`).

**Почему это поможет:**
- Pan становится чистым GPU-transform (translate/scale), без CPU-paint.
- Браузер композитит слои вместо перерисовки 3754 SVG-узлов.
- `contain: layout paint` изолирует область перерисовки.

### B. Zoom Simplification (вторичный, средний риск, средний эффект)
При zoom < 0.4 (40%) упрощать рендеринг внутри каждой фигуры:
- **Текущее**: каждая задача показывает иконку + текстовую метку + рамку + угловые маркеры + заливку.
- **Упрощённое** (< 0.4 zoom): только цветной прямоугольник + текстовая метка (без иконок, без угловых маркеров, без детальных рамок).

**Реализация:** через CSS-правила, скрывающие дочерние SVG-элементы `.djs-visual` при определённом zoom-классе на контейнере, или через лёгкий хук в кастомном renderer.

**Почему это поможет:**
- Большие диаграммы обычно просматриваются при 20–40% zoom.
- На этом zoom детальные иконки всё равно невидимы.
- Удаление SVG-путей иконок снижает количество узлов на ~30–40%.

### C. Упрощение линий связей (низкие усилия)
- При zoom < 0.3: связи как прямые линии вместо routed orthogonal/paths (если применимо через CSS).
- При zoom < 0.2: скрывать метки связей.

---

## 3. Не-цели (строго)

- **НЕТ viewport culling** — НЕ удалять фигуры из DOM.
- **НЕТ `display:none`** на фигурах.
- **НЕТ `innerHTML` манипуляций.**
- **НЕТ модификации ядра bpmn-js** (`node_modules/diagram-js/`, `node_modules/bpmn-js/`).
- **НЕТ backend-изменений.**
- **НЕТ overlay-debounce** — уже сделано в отдельном контуре.

---

## 4. Целевые метрики

### Базовая линия (после debounce)
- Pan FPS большой диаграммы: ~30–50 (воспринимаемый лаг остаётся).

### Цель (после GPU compositing + zoom simplification)
- Pan FPS большой диаграммы: **≥ 55** (GPU-composited pan должен быть близок к 60).
- Воспринимаемый лаг: **устранён** (pan ощущается «скользящим» как Google Maps).
- Маленькая диаграмма: без регрессии, всё ещё 60 FPS.

### Измерение
- Тот же `measureFPS()` в течение 3-секундного pan.
- Та же диаграмма (428 элементов).
- **ПЛЮС**: Chrome DevTools «Layers» — проверить, что SVG-холст на отдельном compositor-слое.
- **ПЛЮС**: Chrome FPS meter — должен показывать стабильные 55+ во время pan.

---

## 5. Детали реализации

### A. GPU compositing
- Найти, где bpmn-js-контейнер монтируется в React (`BpmnStage.jsx`).
- Добавить переключение CSS-класса на начало/конец pan.
- Добавить CSS-правила в `frontend/src/styles/app.css` (или CSS-модуль компонента).
- **Тест**: DevTools → Layers → проверить, что `.djs-container` promoted to layer во время pan.

### B. Zoom simplification
- Найти кастомный bpmn-js renderer (или где `BpmnStage` конфигурирует bpmn-js).
- Добавить проверку zoom в логику отрисовки.
- При zoom < 0.4: пропустить `drawIcon()`, пропустить маркеры, использовать упрощённую рамку.
- При zoom < 0.2: скрыть метки связей.
- **Должно сохраниться**: click selection, hover states, context menu.

### C. CSS containment
```css
.djs-container {
  contain: layout paint style;
}
.djs-container.pan-active {
  will-change: transform;
}
```

---

## 6. Распределение агентов

| Агент | Роль | Deliverables |
|-------|------|-------------|
| Agent 1 (Planner) | Планирование | PLAN.md, prompts, STATE.json, proof files |
| Agent 2 (Worker) | Реализация | Код, отчёты, измерения, WORKER_DONE |
| Agent 3 (Reviewer) | Верификация | REVIEW_PASS / CHANGES_REQUESTED, runtime proof |

---

## 7. Required Gates

- [x] RAG preflight записан (`RAG_PREFLIGHT_PLANNER.md`)
- [x] Obsidian context записан (`OBSIDIAN_CONTEXT_USED.md`)
- [x] GSD context записан (`GSD_CONTEXT_USED.md`)
- [ ] PLAN.md создан с FPS target ≥55
- [ ] Worker prompt **явно запрещает DOM removal / culling**
- [ ] Worker prompt содержит GPU compositing spec
- [ ] Worker prompt содержит zoom simplification spec
- [ ] Reviewer prompt требует DevTools Layers proof
- [ ] Reviewer prompt требует реального mouse drag
- [ ] `READY_FOR_EXECUTION` создан
- [ ] `AGENT_RUN_ID` содержит `20260528T210002Z-13339`
