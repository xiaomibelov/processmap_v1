# Debounce Implementation — Overlay Pan Optimization

**Контур**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Дата**: 2026-05-28

---

## Выбранный подход: комбинация CSS suppression + debounce + bpmn-js deferUpdate

### 1. CSS suppression оверлеев при панорамировании

**Файл**: `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

```js
function bindOverlayPanDebouncer({ eventBus, inst }) {
  const overlayRoot = inst.get("overlays")?._overlayRoot;
  const scheduleRestore = debounce(() => {
    overlayRoot.style.visibility = "";
  }, 150);

  eventBus.on("canvas.viewbox.changing", 1300, () => {
    overlayRoot.style.visibility = "hidden";
    scheduleRestore();
  });

  eventBus.on("canvas.viewbox.changed", 1300, () => {
    scheduleRestore();
  });
}
```

**Почему это работает**:
- bpmn-js `Overlays.show()/hide()` манипулируют только `display`, не `visibility`
- Установка `visibility: hidden` на `_overlayRoot` перекрывает bpmn-js и оставляет оверлеи невидимыми во время панорамирования
- После остановки pan (150 мс trailing debounce) `visibility` сбрасывается
- Оверлеи «прилипают» к правильной позиции, потому что bpmn-js продолжает обновлять `transform` даже когда они скрыты

### 2. Debounce `applyPropertiesOverlayDecorForZoomChange`

```js
const applyPropertiesOverlayDecorForZoomChangeDebounced = debounce(
  applyPropertiesOverlayDecorForZoomChange,
  150,
);
```

**Зачем**: даже с zoom-bucket защитой, при pinch-zoom на трекпаде зум может дрожать, вызывая пересоздание всех property overlays. Debounce предотвращает это.

### 3. bpmn-js `deferUpdate: true`

**Файлы**:
- `frontend/src/components/process/BpmnStage.jsx` (Viewer)
- `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js` (Modeler)

**Что делает**: bpmn-js Canvas дебаунсит `canvas.viewbox.changed` на 300 мс, уменьшая частоту `_updateOverlaysVisibilty` + `show()`

---

## Почему не другие опции

| Опция | Почему отклонена |
|-------|------------------|
| Monkey-patch `Overlays.show()` | Хрупко, ломается при обновлении bpmn-js |
| CSS `!important` на `.djs-overlay-container` | Глобально, может сломать другие модули |
| Удаление оверлеев на время pan | Слишком дорого — recreate 180+ DOM узлов |
| Только `deferUpdate: true` | 300 мс слишком долго; комбинация с 150 мс даёт лучший UX |

---

## Inline-редактирование

В текущей кодовой базе нет кастомных оверлеев с inline-редактированием. bpmn-js `directEditing` создаёт собственный DOM вне `.djs-overlay-container`, поэтому suppress visibility на overlay root не влияет на редактирование лейблов.

---

## Изменённые файлы

```
frontend/src/components/process/BpmnStage.jsx                      | +1  deferUpdate: true
frontend/src/features/process/bpmn/stage/orchestration/
  wireBpmnStageRuntimeEvents.js                                     | +67 bindOverlayPanDebouncer + debounce
frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js       | +1  deferUpdate: true
```
