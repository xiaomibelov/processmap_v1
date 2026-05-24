# RUNTIME_NAVIGATION — fix/diagram-interaction-mode-visual-regression-v1

**Runtime URL:** `http://clearvestnic.ru:5180`  
**Health:** `http://clearvestnic.ru:8088/health`  
**Build info:** `http://clearvestnic.ru:5180/build-info.json`

---

## Scenario A — Open Diagram and Inspect Default Task Style

1. Открыть `http://clearvestnic.ru:5180/?cb=<timestamp>` (fresh browser context).
2. Авторизоваться.
3. Перейти в проект **wewe** / «Описание процессов Долгопрудный».
4. Перейти на вкладку **Diagram**.
5. Дождаться полной загрузки (нет skeleton, нет спиннеров).
6. Выключить overlays: `window.fpcPropertyOverlay = 0` (или через UI).
7. Найти **Task** элемент (прямоугольник с текстом).
8. Открыть DevTools → Elements.
9. Найти `<g class="djs-visual">` внутри `<g class="djs-shape">`.
10. Проверить computed styles:
    - `rect` внутри `.djs-visual`: `fill`, `stroke`, `stroke-width`
    - `text` внутри `.djs-visual`: `font-family`, `font-size`, `font-weight`, `fill`
    - `.viewport`: `filter`
11. Сделать скриншот.

## Scenario B — Canvas Pan / Drag Interaction Mode

1. Нажать левую кнопку мыши на **пустой области canvas** (не на элементе).
2. Удерживая, двигать мышь (pan).
3. Наблюдать визуальное состояние задач во время движения.
4. В DevTools проверить:
   - `.djs-container` имеет класс `.fpcDiagramInteracting`
   - `.viewport` computed `filter`
   - `.djs-visual rect` computed `fill`
   - `.djs-visual text` computed `font-weight`
5. Сделать скриншот (если возможно с зажатой кнопкой — через Playwright).
6. Отпустить кнопку.
7. Проверить, что `.fpcDiagramInteracting` убран.
8. Проверить computed styles после pointerup.

## Scenario C — After Pointerup Stability

1. После Scenario B подождать 1–2 секунды.
2. Проверить computed styles задач — должны совпадать с Scenario A.
3. NO lingering white/gray artifacts.

## Scenario D — Light / Dark Theme

1. Переключить тему через UI (если доступно).
2. Повторить Scenario A.
3. Убедиться, что задачи читаемы в обеих темах.

## Scenario E — Network Safety During Pan

1. Открыть Network tab в DevTools.
2. Очистить лог.
3. Выполнить canvas pan 5–10 секунд.
4. Убедиться:
   - 0 PUT `*/bpmn*`
   - 0 PATCH `*/sessions*`
   - Background polling (presence, versions) — pre-existing, acceptable.

## Scenario F — Console Errors

1. Открыть Console tab.
2. Очистить.
3. Выполнить Scenarios A–E.
4. Убедиться: 0 новых ошибок.

---

## Useful DevTools Snippets

```javascript
// Check interaction mode class
document.querySelector('.djs-container').classList.contains('fpcDiagramInteracting')

// Check viewport filter
getComputedStyle(document.querySelector('.viewport')).filter

// Check task fill
getComputedStyle(document.querySelector('.djs-visual rect')).fill

// Check task text font-weight
getComputedStyle(document.querySelector('.djs-visual text')).fontWeight

// Check version
window.__PROCESSMAP_BUILD_INFO__

// Check overlays off
document.querySelectorAll('.fpcPropertyOverlay').length
```
