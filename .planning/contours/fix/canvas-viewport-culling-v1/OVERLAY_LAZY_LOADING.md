# Overlay Lazy Loading

## Цель
Не создавать DOM/HTML-оверлеи (badges, маркеры) для элементов, чьи SVG-группы отсоединены от DOM viewport culling-ом.

## Что было изменено

### 1. `BpmnStage.jsx` — `setSelectedDecor`

Добавлена проверка `isGfxInDom(inst, el)` перед вызовом `applySelectionFocusDecor`.
- Если фигура off-screen — selection decor (fpcFocusDim и пр.) не применяется
- `selectedMarkerStateRef` всё равно запоминает выбор, чтобы при возвращении в viewport декор мог быть восстановлен

### 2. `decorManager.js` — visibility guard

Добавлен хелпер `isElementGfxInDom(inst, el)` и проверки перед созданием overlay в:
- `applyInterviewDecor` — AI/DoD/Notes badges
- `applyUserNotesDecor` — user notes + documentation badges
- `applyStepTimeDecor` — time badges
- `applyRobotMetaDecor` — robot meta badges

Логика: после `findShapeByNodeId` / `findShapeForHint` проверяем `isElementGfxInDom`. Если `false` — пропускаем элемент.

## Почему это безопасно

- bpmn-js `overlays.add` создаёт HTML-элементы, позиционируемые относительно canvas. Для off-screen фигур они всё равно были бы невидимы или мешали бы layout.
- Property overlays (`fpcPropertyOverlay`) уже были viewport-culled в предыдущем контуре `perf/diagram-property-overlays-viewport-culling-v1`.
