# React Re-render Audit — fix/canvas-shape-rendering-react-audit-v1

## Scope аудита

- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- Родительские компоненты и хуки, через которые могут «просочиться» re-renders

---

## Поисковые запросы

```bash
grep -n "useState\|setState\|useReducer\|dispatch" frontend/src/components/process/BpmnStage.jsx
grep -n "canvas.viewbox.changed\|canvas.viewbox.changing\|viewbox.changed" frontend/src/components/process/BpmnStage.jsx
grep -n "canvas.viewbox.changed\|canvas.viewbox.changing" frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js
```

---

## Найдено в BpmnStage.jsx

### State-переменные (useState)

| Переменная | Обновляется при pan? | Вывод |
|------------|----------------------|-------|
| `xml` / `setXml` | ❌ Нет | Обновляется только при load/import/save |
| `xmlDraft` / `setXmlDraft` | ❌ Нет | Обновляется только при ручном редактировании XML |
| `xmlDirty` / `setXmlDirty` | ❌ Нет | Зависит от `xmlDraft` vs `xml` |
| `xmlSaveBusy` / `setXmlSaveBusy` | ❌ Нет | Только во время HTTP-save |
| `srcHint` / `setSrcHint` | ❌ Нет | Только при смене источника XML |
| `err` / `setErr` | ❌ Нет | Только при ошибках загрузки/валидации |
| `diagramReady` / `setDiagramReady` | ❌ Нет | Обновляется при flip `destroyed↔ready`, не каждый кадр |

### Обработчики viewbox

```javascript
// BpmnStage.jsx:1387
function emitViewboxChanged(payload = {}) {
  const listeners = viewboxListenersRef.current;
  if (!(listeners instanceof Set) || !listeners.size) return;
  listeners.forEach((listener) => { try { listener(payload); } catch {} });
}
```

- `viewboxListenersRef` — `useRef(new Set())`, **не** `useState`.
- Callback-и регистрируются через imperative API (`onCanvasViewboxChanged`).
- **Нет React re-render** при вызове `emitViewboxChanged`.

### wireBpmnStageRuntimeEvents.js

```javascript
// bindViewerStageEvents / bindModelerStageEvents
eventBus.on("canvas.viewbox.changed", 1200, () => {
  // ...
  emitViewboxChanged({ mode: "viewer/editor", suppressed, snapshot: snap });
  applyPropertiesOverlayDecorForZoomChangeDebounced(inst, mode);
  if (viewportCuller) viewportCuller.scheduleCull();
});
```

- `emitViewboxChanged` — ref-based pub/sub (см. выше).
- `applyPropertiesOverlayDecorForZoomChangeDebounced` — debounce 150ms, **не** `setState`.
- `viewportCuller.scheduleCull` — DOM-манипуляции через ref, **не** `setState`.

---

## Родительская цепочка: ProcessStage.jsx

### Найдено: `useBpmnViewportSource.js` обновляет React-state при pan

```javascript
// useBpmnViewportSource.js:128-131
const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
const [viewportMatrix, setViewportMatrix] = useState({ ... });
const [viewbox, setViewbox] = useState({ ... });
const [containerRect, setContainerRect] = useState({ ... });
```

- `scheduleApply` → `applyViewbox` вызывает `setViewbox` / `setViewportMatrix` при изменении viewbox.
- Изменения батчатся через `requestAnimationFrame`, но во время pan viewbox меняется каждый кадр → **state обновляется**.
- Это вызывает **re-render `ProcessStage.jsx`**.

### Почему BpmnStage НЕ re-renderится

1. **`ProcessDiagramOverlayLayers` обёрнут в `memo`.**
2. **`useStableProcessDiagramOverlayLayersProps`** — кастомная мемоизация:
   - `bpmnStageProps` строится через `readMemoizedSegment` с shallow-equal.
   - `BPMN_INPUT_KEYS` **не включают** `hybridViewportMatrix`, `overlayViewbox` и т.д.
   - Следовательно, при изменении viewbox `bpmnStageProps` **остаётся стабильным**.
3. **Вывод:** `BpmnStage` не получает новых props → `memo` блокирует re-render.

---

## Вердикт

| Проверка | Результат |
|----------|-----------|
| `setState` внутри `BpmnStage.jsx` при pan | ❌ **Не найдено** |
| Re-render `.djs-container` / `BpmnStage` при pan | ❌ **Не происходит** (защищено `memo` + stable props) |
| Re-render `ProcessStage` при pan | ⚠️ **Происходит** (из-за `useBpmnViewportSource`), но вне bounded контура |

## Рекомендация

Текущая архитектура уже предотвращает re-render `BpmnStage`. Если в будущем потребуется устранить re-render `ProcessStage`, это потребует рефакторинга `useBpmnViewportSource.js` (перевод `viewbox`/`viewportMatrix` в `useRef` с императивной подпиской для overlay-контроллеров). Это **вне scope** текущего контура.
