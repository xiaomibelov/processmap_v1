# Pan Debounce / RAF Throttle

## Цель
Не тормозить нативное панорамирование bpmn-js, но реже запускать дорогой пересчёт culling.

## Параметры

- `CULLING_FRAME_SKIP = 2` — culling выполняется каждый 3-й кадр
- Быстрое панорамирование: bpmn-js обновляет `transform` на каждый `pointermove` через GPU
- Наш culling: пересчёт 428 элементов + DOM операции

## Реализация

```js
let rafId = null;
let frameCounter = 0;

function scheduleCull() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    frameCounter++;
    if (frameCounter % (CULLING_FRAME_SKIP + 1) === 0) {
      runCulling();
    }
    rafId = null;
  });
}
```

- Новое событие `viewbox.changed` отменяет предыдущий RAF и планирует новый
- `forceCull()` — немедленный запуск (используется при dispose)

## Эффект

- При непрерывной панораме culling обновляется ~20 раз/сек вместо ~60
- После остановки панорамы следующий кадр догоняет (RAF сбрасывается)
