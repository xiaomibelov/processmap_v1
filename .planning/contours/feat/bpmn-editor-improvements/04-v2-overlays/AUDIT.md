# AUDIT — V2 Overlays Checkbox Bug

## Проблема
При отдалении канваса и повторном нажатии чекбокса "Показывать все V2-оверлеи свойств" оверлеи не затираются, чекбокс перестаёт работать.

## Чекбокс
- **Рендер**: `frontend/src/components/NotesPanel.jsx:3178-3187`.
- **Состояние**: `v2OverlaysEnabled` в `App.jsx:886`; setter прокидывается в `NotesPanel`, `ProcessStage`, `BpmnStage`.
- **Обработчик**: `onShowV2OverlaysChange` — обычный controlled input.
- Сам чекбокс работает; ощущение "не работает" вызвано тем, что DOM-оверлеи не реагируют на состояние.

## Жизненный цикл V2-оверлеев
- **Менеджер**: `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js`.
- `mountFromBpmn(inst, kind)` → `extractOverlaysFromBpmn(inst, enabledRef.current)` → `mount(inst, kind, overlayList)`.
- `mount()`:
  1. Строит `desired` map.
  2. Viewport culling по текущему `canvas.viewbox()`.
  3. Дифф с `elementOverlayMapRef.current[kind]`.
  4. Новые — `overlays.add(...)`; устаревшие — `overlays.remove(...)`.
- `createV2HostForElement(ovl, el)` создаёт DOM-хост; внутри есть guard:
  ```js
  const v2Enabled = enabledRef.current;
  if (!hasProps && (!v2Enabled || !titleText)) return null;
  if (!v2Enabled) return null;
  ```
  Но этот guard срабатывает только при создании нового хоста.

## Viewport culling
- `mount()` читает `canvas.viewbox()` один раз в момент вызова.
- Culling не перезапускается на pan/zoom.
- `patchOverlayPanPerf.js` ставит на паузу `_updateOverlaysVisibilty` во время жестов, но работает только с существующими overlay hosts.
- `cullBpmnViewport.js` прячет SVG-шейпы, но не трогает HTML-оверлеи.

## Почему чекбокс "не работает"
1. `extractOverlaysFromBpmn(inst, enabledRef.current)` использует `enabledRef.current` только как `forceShow` для name-only fallback. Элементы с реальными Camunda properties всё равно возвращаются в `desired`.
2. При выключении чекбокса `desired` не меняется для property-элементов.
3. Каждый такой элемент уже есть в `elementOverlayMapRef` с неизменным `contentSig`.
4. Дифф-логика считает entry "kept" и не вызывает `createV2HostForElement`, поэтому guard `if (!v2Enabled) return null;` не участвует.
5. Результат: `.fpc-overlay-v2-host` остаётся в DOM; визуально ничего не меняется.

## Воспроизведение
1. Открыть диаграмму с property-элементами.
2. Отдалить (fit-to-viewport), чтобы viewbox покрывал всю диаграмму.
3. Включить V2 overlays — они появляются.
4. Выключить V2 overlays — они остаются; чекбокс кажется нерабочим.

## Дополнительные проблемы
- `mount()` не вызывается на zoom/pan → при отдалении новые оверлеи не появляются, если изначально были отcullены.
- `manager.uninstall()` / `clear()` нигде не вызываются → overlay IDs и `eventBus` listeners не очищаются при уничтожении инстанса.

## Релевантные файлы
- `frontend/src/components/NotesPanel.jsx`
- `frontend/src/App.jsx`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js`
- `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js`
- `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js`
- `frontend/src/features/process/bpmn/stage/overlay/useOverlayLifecycle.js`
