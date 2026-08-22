# PLAN — Emergency revert of canvas GPU-compositing/zoom-simplification regression

**Контур**: `fix/canvas-overlay-regression-emergency-v1`  
**Запуск**: `20260528T224900Z-21407`  
**Статус**: Готов к исполнению  
**Язык отчётов**: Русский  
**Язык промптов агентов**: Английский

---

## 1. Контекст

### Регрессия
Пользователь: **«Теперь при передвижении оверлеи пропадают»**.

- При pan оверлеи (labels, badges, property indicators) исчезают.
- Фигуры остаются видимыми (в отличие от предыдущей culling-регрессии).
- Скруббер может работать или нет.

### Причина
Контур `fix/canvas-gpu-compositing-zoom-simplification-v1` добавил:
1. CSS `will-change: transform`, `transform: translateZ(0)`, `contain: layout paint style` на `.djs-container` / `.djs-canvas`.
2. JS-хук `bindGpuCompositingAndZoomHooks` — добавляет/убирает класс `pan-active` во время pan.
3. CSS zoom-simplification (`zoom-simplified`, `zoom-minimal`) — скрывает иконки/маркеры при низком zoom.
4. `deferUpdate: true` в конфигурации bpmn-js (Viewer + Modeler).

Пункты 1–2 создают GPU-compositing слой, из-за которого bpmn-js перестаёт корректно позиционировать абсолютно позиционированные оверлеи во время pan.

### Предыдущий стабильный контур
`fix/canvas-overlay-debounce-v1` — REVIEW_PASS, не ломал оверлеи. Его изменения нужно **сохранить**:
- `bindOverlayPanDebouncer` — скрывает `_overlayRoot` на время pan (150 мс debounce).
- `debounce` utility.
- `applyPropertiesOverlayDecorForZoomChangeDebounced`.
- `deferUpdate: true`.

---

## 2. Стратегия исправления

### Цель
Восстановить стабильное поведение оверлеев: **оверлеи видны всегда, кроме intentional suppression во время pan (debounce), и после pan возвращаются на место**.

### Что удалить
1. **CSS** `frontend/src/styles/legacy/legacy_bpmn.css` — удалить ВСЁ, добавленное gpu-compositing контуром (строки 68–101).
2. **JS** `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`:
   - Удалить функции: `updateZoomClass`, `bindGpuCompositingAndZoomHooks`.
   - Удалить константы: `GPU_PAN_ACTIVE_CLASS`, `ZOOM_FULL_CLASS`, `ZOOM_SIMPLIFIED_CLASS`, `ZOOM_MINIMAL_CLASS`.
   - Удалить вызовы `bindGpuCompositingAndZoomHooks({ eventBus, inst })` в `bindViewerStageEvents` и `bindModelerStageEvents`.
   - **Сохранить**: `bindOverlayPanDebouncer`, `debounce`, `applyPropertiesOverlayDecorForZoomChangeDebounced`, `OVERLAY_PAN_DEBOUNCE_MS`.

### Что оставить
- `deferUpdate: true` в `BpmnStage.jsx` и `bpmnWiring.js` — от debounce-контура, безопасно.
- `bindOverlayPanDebouncer` и связанный debounce — от debounce-контура, безопасно.

---

## 3. Детали реализации

### Шаг 1: Revert CSS
```bash
git checkout HEAD -- frontend/src/styles/legacy/legacy_bpmn.css
```
Или вручную удалить блоки:
- `/* ── GPU compositing for pan performance ── */` (строки 68–82)
- `/* ── Zoom simplification (< 0.4) ── */` (строки 84–90)
- `/* ── Zoom minimal (< 0.2) ── */` (строки 92–101)

### Шаг 2: Удалить GPU compositing hooks из JS
В `wireBpmnStageRuntimeEvents.js`:
1. Удалить строки 12–19 (константы GPU/zoom).
2. Удалить строки 21–35 (функция `updateZoomClass`).
3. Удалить строки 37–74 (функция `bindGpuCompositingAndZoomHooks`).
4. В `bindViewerStageEvents`: удалить вызов `bindGpuCompositingAndZoomHooks({ eventBus, inst });`.
5. В `bindModelerStageEvents`: удалить вызов `bindGpuCompositingAndZoomHooks({ eventBus, inst });`.

### Шаг 3: Сборка и перезапуск
```bash
cd /opt/processmap-test/frontend && npm run build
docker compose -p processmap_test restart gateway
```

### Шаг 4: Ручная верификация на :5177
1. Загрузить диаграмму.
2. Убедиться, что оверлеи видны изначально.
3. Pan во всех направлениях — оверлеи должны двигаться вместе с фигурами, не исчезать.
4. Быстрый pan — оверлеи могут мигнуть (suppression debounce), но не должны пропадать полностью.
5. Остановить pan — оверлеи должны вернуться на корректные позиции.
6. Zoom in/out — оверлеи масштабируются корректно.
7. Скруббер работает.
8. Console без ошибок.

---

## 4. Не-цели (строго)

- **НЕТ viewport culling** — не возвращать удаление фигур из DOM.
- **НЕТ нового CSS** без тестирования поведения оверлеев.
- **НЕТ изменений backend**.
- **НЕТ модификации ядра bpmn-js** (`node_modules/`).
- **НЕТ merge/deploy/PR** — только revert в рабочей ветке.

---

## 5. Критерии приёмки (must pass ALL)

| # | Критерий | Статус |
|---|----------|--------|
| 1 | Оверлеи видны при загрузке диаграммы | ⬜ |
| 2 | При pan оверлеи не исчезают (могут мигать из-за debounce, но DOM-узлы остаются) | ⬜ |
| 3 | После pan оверлеи на корректных позициях | ⬜ |
| 4 | Zoom in/out корректно масштабирует оверлеи | ⬜ |
| 5 | Скруббер работает | ⬜ |
| 6 | Console без ошибок от bpmn-js overlay module | ⬜ |

**FAIL** если:
- Любой оверлей исчезает во время pan.
- Оверлеи отделяются от фигур.
- Скруббер сломан.

---

## 6. Распределение агентов

| Агент | Роль | Deliverables |
|-------|------|-------------|
| Agent 1 (Planner) | Планирование | PLAN.md, prompts, STATE.json, proof files |
| Agent 2 (Worker) | Revert + тест | Код, отчёты, RUNTIME_PROOF_5177.md, WORKER_DONE |
| Agent 3 (Reviewer) | Верификация | REVIEW_PASS / CHANGES_REQUESTED, runtime proof |

---

## 7. Required Gates

- [x] RAG preflight записан (`RAG_PREFLIGHT_PLANNER.md`)
- [x] Obsidian context записан (`OBSIDIAN_CONTEXT_USED.md`)
- [x] GSD context записан (`GSD_CONTEXT_USED.md`)
- [x] PLAN.md создан с явными критериями приёмки
- [x] Worker prompt запрещает новый CSS / culling
- [x] Reviewer prompt требует реального mouse drag
- [x] `READY_FOR_EXECUTION` создан
- [x] `AGENT_RUN_ID` содержит `20260528T224900Z-21407`
