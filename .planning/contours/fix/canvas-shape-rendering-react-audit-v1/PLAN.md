# PLAN — Safe CSS shape-rendering + React re-render audit on BPMN canvas

**Контур**: `fix/canvas-shape-rendering-react-audit-v1`  
**Запуск**: `20260529T000236Z-27528`  
**Статус**: Готов к исполнению  
**Язык отчётов**: Русский  
**Язык промптов агентов**: Английский

---

## 1. Контекст

### Предыдущие попытки
- `fix/canvas-viewport-culling-v1`: **ОТКАЧЕН** — фигуры исчезали при выходе из viewport.
- `fix/canvas-overlay-debounce-v1`: **REVIEW_PASS** — FPS измерен ~58.7, но пользователь сообщает «Лаги не убрались» — воспринимаемое запаздывание остаётся.
- `fix/canvas-gpu-compositing-zoom-simplification-v1`: **ОТКАЧЕН** — оверлеи пропадали при pan из-за `will-change: transform` / `contain: layout paint` на `.djs-container`.

### Текущее состояние (после отката GPU compositing)
- Холст стабилен, оверлеи видны при pan, скруббер работает.
- Большая диаграмма (428 элементов): FPS ~30 при pan.
- Требование пользователя: **«А + при передвижении по канвасу оверлеи не должны пропадать»**.

### Гипотеза
Оставшийся лаг вызван двумя независимыми факторами:
1. **Paint cost SVG** — 3754 узла рендерятся с `shape-rendering: geometricPrecision` (тяжёлый antialiasing). Переключение на `optimizeSpeed` снизит CPU paint cost.
2. **React reconciliation** — `BpmnStage.jsx` или обёртка вызывает `setState` на каждое `canvas.viewbox.changed`, запуская reconciliation всего дерева включая 3754 SVG-узлов.

---

## 2. Область: ТОЛЬКО безопасные оптимизации

### A. CSS shape-rendering (безопасно, только CSS, без JS)
Добавить в глобальный CSS, таргетируя SVG bpmn-js:

```css
.djs-container svg {
  shape-rendering: optimizeSpeed;
}

.djs-container svg .djs-connection {
  vector-effect: non-scaling-stroke;
}

.djs-container svg .djs-shape {
  shape-rendering: crispEdges;
}
```

**Почему безопасно:**
- Чистый CSS, без манипуляций DOM.
- Без изменений позиционирования.
- Без promotion слоёв (`will-change`, `translateZ`).
- `shape-rendering` — hint; браузер игнорирует при неподдержке.
- Оверлеи — HTML-элементы вне SVG, не затронуты.

### B. React re-render audit (критично)
**Гипотеза**: `BpmnStage.jsx` или обёртка вызывает `setState` на каждое `canvas.viewbox.changed`, запуская React reconciliation всего компонентного дерева включая 3754 SVG-узла.

Agent 2 должен:
1. Найти `BpmnStage.jsx` (или эквивалентный React-компонент BPMN-холста).
2. Найти обновления состояния внутри обработчиков событий:
   - `canvas.on('viewbox.changed', ...)`
   - `canvas.on('canvas.viewbox.changed', ...)`
   - `eventBus.on('canvas.viewbox.changing', ...)`
   - Любой `useState` setter из callback-ов bpmn-js.
3. Проверить, обновляет ли `setState`:
   - Координаты viewbox (x, y, scale)?
   - Состояние selection?
   - Данные overlay?
   - Любое другое состояние, меняющееся каждый кадр pan?
4. Если найдено — перенести tracking viewbox в `useRef` (не `useState`) или debounce state update до 200 ms trailing.
5. Убедиться, что React DevTools «Highlight updates» НЕ показывает re-renders на `.djs-container` во время pan.

### C. Запрещено (строгие non-goals)
- **НЕТ** `will-change` на `.djs-container` или SVG.
- **НЕТ** CSS-свойства `contain` на `.djs-container`.
- **НЕТ** `translateZ(0)` или `transform` на `.djs-container`.
- **НЕТ** viewport culling (без удаления из DOM).
- **НЕТ** `display:none` / `visibility:hidden` на фигурах.
- **НЕТ** модификации ядра bpmn-js.
- **НЕТ** изменений overlay debounce — уже сделано в отдельном контуре.

---

## 3. Детали реализации

### A. CSS-изменения
- **Файл**: `frontend/src/styles/legacy/legacy_bpmn.css` или `frontend/src/index.css` (или выделенный `bpmn-overrides.css`).
- Добавить `.djs-container svg { shape-rendering: optimizeSpeed; }`.
- Добавить `.djs-container svg .djs-connection { vector-effect: non-scaling-stroke; }`.
- Проверить, что нет конфликтов с другими правилами `.djs-container` (особенно из откаченного GPU compositing).

### B. React audit
- **Файл**: `frontend/src/components/process/BpmnStage.jsx`.
- Искать: `useState`, `setState`, `useReducer`, `dispatch` внутри хуков событий bpmn-js.
- Проверить: `useEffect(() => { modeler.on('...', () => setX(...)) }, [])`.
- Паттерн исправления:
  ```javascript
  // ПЛОХО: вызывает re-render каждый кадр pan
  const [viewbox, setViewbox] = useState(null);
  useEffect(() => {
    modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => setViewbox(viewbox));
  }, []);

  // ХОРОШО: только ref, без re-render
  const viewboxRef = useRef(null);
  useEffect(() => {
    modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => { viewboxRef.current = viewbox; });
  }, []);
  ```

### C. Верификация через React DevTools
- Установить React DevTools (или использовать react-devtools standalone).
- Включить «Highlight updates when components render».
- Панорамировать холст — `.djs-container` и `BpmnStage` НЕ должны мигать (нет re-render).
- `BpmnStage` должен перерисовываться только при: начальной загрузке, выборе элемента, импорте диаграммы.

---

## 4. Целевые метрики

### Базовая линия (текущее, после отката GPU)
- Pan FPS большой диаграммы: ~30
- React re-renders при pan: неизвестно (требуется аудит)

### Цель (после CSS + React fix)
- Pan FPS большой диаграммы: **≥ 38–40** (+8–10 FPS)
- React re-renders при pan: **0** (`BpmnStage` не должен перерисовываться)
- Оверлеи: видны и корректно позиционированы во время pan
- Маленькая диаграмма: без регрессии, 60 FPS

### Измерение
- Тот же метод: `measureFPS()` в течение 3-секундного pan.
- Та же диаграмма (428 элементов).
- React DevTools profiler: записать 3-секундный pan, проверить количество рендеров `BpmnStage`.

---

## 5. Распределение агентов

| Агент | Роль | Deliverables |
|-------|------|-------------|
| Agent 1 (Planner) | Планирование | PLAN.md, prompts, STATE.json, proof files |
| Agent 2 (Worker) | Реализация | Код, отчёты, измерения, WORKER_DONE |
| Agent 3 (Reviewer) | Верификация | REVIEW_PASS / CHANGES_REQUESTED, runtime proof |

---

## 6. Required Gates

- [x] RAG preflight записан (`RAG_PREFLIGHT_PLANNER.md`)
- [x] Obsidian context записан (`OBSIDIAN_CONTEXT_USED.md`)
- [x] GSD context записан (`GSD_CONTEXT_USED.md`)
- [x] PLAN.md создан с FPS target ≥38
- [x] Worker prompt явно запрещает `will-change`, `contain`, `translateZ` на `.djs-container`
- [x] Worker prompt содержит React re-render audit requirement
- [x] Reviewer prompt требует проверки оверлеев при pan
- [x] Reviewer prompt требует реального mouse drag
- [x] `READY_FOR_EXECUTION` создан
- [x] `AGENT_RUN_ID` содержит `20260529T000236Z-27528`
