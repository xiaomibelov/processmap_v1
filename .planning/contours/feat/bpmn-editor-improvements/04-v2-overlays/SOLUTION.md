# SOLUTION — V2 Overlays Bug

## Цель
Чекбокс "Показывать все V2-оверлеи свойств" надёжно включает/выключает оверлеи, включая после zoom-out/pan.

## Предлагаемый подход
### Минимальный фикс toggle
В `overlayLifecycleManager.js`, функция `mount()`:
- При итерации `desired`: если `createV2HostForElement(ovl, el)` возвращает `null` и для этого элемента уже есть entry в `elementOverlayMapRef`, вызвать `overlays.remove(entry.overlayId)` и удалить из map.
- Это заставит чекбокс фактически очищать оверлеи при `v2OverlaysEnabled = false`.

### Альтернатива (более чистая)
В `mountFromBpmn()`:
- Если `enabledRef.current === false`, передавать пустой список в `mount()`.
- Тогда existing `toRemove` cleanup удалит все V2-оверлеи.
- Но это может повлиять на non-V2 overlays, если они смешаны в том же manager; нужно разделить kind или фильтровать.

### Re-run culling на pan/zoom
- В `BpmnStage.jsx` подписаться на `canvas.viewbox.changed` (или использовать существующий `viewboxListenersRef`).
- Throttle-вызов `overlayLifecycle.mountFromBpmn(inst, kind)` при `v2OverlaysEnabled === true`.
- Использовать `shouldSkipOverlayRebuildDuringPan` (`stageRuntimePerformance.js`) для пропуска во время active gesture.
- Это также исправит ситуацию, когда после zoom-in появились только часть оверлеев, а при zoom-out остальные не добавились.

### Cleanup
- В `useOverlayLifecycle.js` в cleanup effect вызывать `manager.uninstall(inst)` для viewer и modeler.
- В `BpmnStage.jsx` при destroy инстанса тоже вызывать uninstall.
- Убедиться, что `uninstall` убирает `element.hover` / `element.out` listeners и overlay IDs.

## Минимальные изменения
- `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js` — fix removal when host is null.
- `frontend/src/components/process/BpmnStage.jsx` — viewbox-changed handler для remount overlays.
- `frontend/src/features/process/bpmn/stage/overlay/useOverlayLifecycle.js` — cleanup uninstall.

## Регрессионный тест
- Включить V2 overlays → убедиться, что `.fpc-overlay-v2-host` есть.
- Выключить → убедиться, что их нет, даже после fit-to-viewport.
- Zoom-in → off-screen overlays отcullены; zoom-out → появляются снова.
