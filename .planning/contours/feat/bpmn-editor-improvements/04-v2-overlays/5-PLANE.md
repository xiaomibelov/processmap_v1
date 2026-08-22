# 5-PLANE — V2 Overlays Bug

## 1. UX Plane
- **Сейчас**: чекбокс перестаёт влиять на видимость после zoom-out; пользователь думает, что UI сломался.
- **Нужно**: чекбокс надёжно включает/выключает все V2-оверлеи; zoom/pan корректно обновляет culling.

## 2. Data Plane
- Данные оверлеев — элементы `elementRegistry` bpmn-js + Camunda properties.
- Состояние `v2OverlaysEnabled` уже хранится в React; `enabledRef` синхронизируется в `useV2OverlayState`.
- `elementOverlayMapRef` — императивный Map с `overlayId`, `contentSig`, `host`, `expanded`.

## 3. Logic Plane
- `mount()` строит `desired`, culls, diff-ит с текущим map.
- **Ошибка**: `desired` не зависит от `v2OverlaysEnabled` для элементов с properties; дифф не удаляет существующие entry, когда хост должен исчезнуть.
- **Ошибка**: culling вычисляется только в момент `mount()`; pan/zoom не триггерит пересчёт.

## 4. Integration Plane
- `patchOverlayPanPerf.js` управляет позиционированием существующих overlay; можно зацепиться на `canvas.viewbox.changed` для пересоздания culling.
- `cullBpmnViewport.js` не участвует в HTML-оверлеях.
- Нужно избежать частых пересозданий DOM; использовать throttle.

## 5. Stability / Cleanup Plane
- `uninstall()` / `clear()` никогда не вызываются → утечка overlay IDs и listeners.
- Нужно вызывать cleanup в `useOverlayLifecycle` и при destroy инстанса в `BpmnStage`.
