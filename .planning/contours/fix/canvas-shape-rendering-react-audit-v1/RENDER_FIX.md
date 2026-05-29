# Render Fix — fix/canvas-shape-rendering-react-audit-v1

## Статус: FIX NOT REQUIRED

В ходе аудита **не было обнаружено** `setState` внутри `BpmnStage.jsx` или `wireBpmnStageRuntimeEvents.js`, который вызывался бы на каждый кадр pan.

### Что проверено

1. **BpmnStage.jsx** — все 7 вызовов `useState` проверены. Ни один не обновляется внутри `canvas.viewbox.changed` / `canvas.viewbox.changing`.
2. **`emitViewboxChanged`** — использует `useRef(new Set())` + imperative listeners. При вызове из `eventBus.on('canvas.viewbox.changed', ...)` **не** запускает React reconciliation.
3. **Parent props stability** — `ProcessDiagramOverlayLayers` обёрнут в `memo`, а `useStableProcessDiagramOverlayLayersProps` гарантирует, что `bpmnStageProps` не меняется при pan.

### Почему фикс не требуется

- Гипотеза PLAN: «`BpmnStage.jsx` или обёртка вызывает `setState` на каждое `canvas.viewbox.changed`» — **не подтвердилась**.
- Re-render canvas при pan **уже предотвращён** существующей архитектурой (ref-based pub/sub + memoized props).

### Если в будущем потребуется фикс

Паттерн, рекомендованный PLAN, применим к `useBpmnViewportSource.js` (вне текущего контура):

```javascript
// ПЛОХО (текущий код в useBpmnViewportSource.js)
const [viewbox, setViewbox] = useState({ ... });
useEffect(() => {
  const unsubscribe = canvasApi.onViewboxChanged((next) => {
    scheduleApply(next); // внутри вызывает setViewbox
  });
  return unsubscribe;
}, []);

// ХОРОШО (если понадобится в будущем)
const viewboxRef = useRef({ ... });
useEffect(() => {
  const unsubscribe = canvasApi.onViewboxChanged((next) => {
    viewboxRef.current = next;
    notifySubscribers(next); // imperative, без setState
  });
  return unsubscribe;
}, []);
```

---

**Вывод:** кодовых изменений для React fix в рамках контура `fix/canvas-shape-rendering-react-audit-v1` **не требуется**.
