# IMPLEMENTATION_NOTES — fix/diagram-interaction-mode-visual-regression-v1

**Run ID:** 20260516T224839Z-35866
**Agent:** Agent 2 / Executor Part 1

---

## Что изменено

### 1. `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`

**Проблема:** `.dark .bpmnStage` использовал тёмный `--bpmn-task-fill: rgba(15, 22, 38, 0.72)`, а глобальное правило смешивало его с transparent на 20%, давая фактический fill `rgba(15,22,38,0.144)` — тёмно-серый.

**Изменения:**
- `--bpmn-task-fill` в `.dark .bpmnStage`: `rgba(15, 22, 38, 0.72)` → `rgba(255, 255, 255, 0.92)`
- `--bpmn-task-stroke` в `.dark .bpmnStage`: `rgba(236, 245, 255, 0.78)` → `rgba(30, 41, 59, 0.8)`
- Глобальный `color-mix` для fill: `20%` → `92%`

**Результат:** Fill задач в тёмной теме станет `color-mix(in srgb, rgba(255,255,255,0.92) 92%, transparent)` ≈ белый с высокой непрозрачностью.

### 2. `frontend/src/styles/legacy/legacy_bpmn.css`

**Проблема:** Базовый `filter: brightness(.88) contrast(.96)` на `.viewport` делал все задачи серее; при `fpcDiagramInteracting` filter сбрасывался в `none`, вызывая белый flash.

**Изменения:**
- Удалён базовый viewport filter.
- Удалён `filter: none` из interaction-mode правила.
- Сохранён `will-change: transform` (performance optimization).

### 3. `frontend/src/styles/app/06-final-structure.css`

**Проблема:** Дублирование тех же filter-правил.

**Изменения:** Аналогично legacy_bpmn.css — удалён filter, оставлен `will-change: transform`.

### 4. `frontend/src/config/appVersion.js`

**Изменения:** Changelog v1.0.133 приведён к спецификации контура.

---

## Что НЕ изменено

- `diagramInteractionMode.js` — toggle-логика корректна, не трогана.
- `wireBpmnStageRuntimeEvents.js` — guard side effects не троганы.
- `shape-rendering: crispEdges` — селектор не затрагивает text, оставлен для фигур.
- Backend — вне скоупа.
- Новые пакеты — не установлены.

---

## Риски

- Light theme не тестировалась вручную в Part 1 (тёмная тема активна по умолчанию).
- `color-mix` percentage 92% глобально — light theme имеет собственный override с `!important`, поэтому риск минимален.

## Рекомендации для Part 2

1. Собрать frontend (`npm run build` или Docker container).
2. Проверить свежий 5180.
3. Сделать after-скриншоты.
4. Проверить отсутствие белого flash при pan.
5. Проверить light theme (если доступна).
