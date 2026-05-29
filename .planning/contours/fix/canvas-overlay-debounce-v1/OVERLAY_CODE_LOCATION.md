# Где живёт код обновления оверлеев

**Контур**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Дата**: 2026-05-28

---

## Ключевые файлы

| Файл | Роль |
|------|------|
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Подписка на `canvas.viewbox.changed` — вызывает `applyPropertiesOverlayDecorForZoomChange` и `emitViewboxChanged` |
| `frontend/src/components/process/BpmnStage.jsx` | Создание `Viewer`/`Modeler`, регистрация `emitViewboxChanged`, `applyPropertiesOverlayDecorForZoomChange` |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Реализация `applyPropertiesOverlayDecor` — создаёт/удаляет DOM-оверлеи свойств (таблицы, badges) |
| `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js` | Создание runtime modeler через `createBpmnRuntime` с `getCtorOptions` |

---

## Как был найден код

1. `grep -r "viewbox.changed" frontend/src/` — единственный файл продукта с подпиской: `wireBpmnStageRuntimeEvents.js`
2. `grep -r "applyPropertiesOverlayDecorForZoomChange" frontend/src/` — вызывается из `wireBpmnStageRuntimeEvents.js` и определён в `BpmnStage.jsx`
3. `grep -r "overlays.add\|overlays.remove" frontend/src/features/process/bpmn/stage/decor/decorManager.js` — все кастомные оверлеи добавляются через bpmn-js `overlays.add()`
4. Анализ `frontend/node_modules/diagram-js/lib/features/overlays/Overlays.js` — bpmn-js скрывает оверлеи на `viewbox.changing` и показывает на `viewbox.changed`, вызывая `_updateOverlaysVisibilty` для всех 180+ оверлеев каждый кадр

---

## Архитектура обновления оверлеев

```
Пан мышью
  → Canvas._changeViewbox()
    → eventBus.fire('canvas.viewbox.changing')
      → Overlays.hide()          // display: none на .djs-overlay-container
    → eventBus.fire('canvas.viewbox.changed')
      → Overlays._updateRoot()   // transform matrix
      → Overlays._updateOverlaysVisibilty() // 180× setVisible + setTransform
      → Overlays.show()          // display: ''
```

Проблема: даже при `display: none` на корне, `show()` на каждом кадре заставляет браузер пересчитывать layout для 180+ тяжёлых DOM-узлов (таблицы свойств с inline-стилями).

---

## Obsidian/GSD факты, повлиявшие на поиск

- Obsidian: `Diagram Property Overlays Performance Audit.md` — 180 `.fpcPropertyOverlay` контейнеров, +2770 узлов, каждый оверлей применяет 8+ inline CSS
- RAG preflight: подтвердил, что `useBpmnSettledDecorFanout` — read-only suggestion layer, Worker должен делать runtime proof сам
