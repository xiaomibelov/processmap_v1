# Runtime Proof — :5177

**Контур**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Дата**: 2026-05-28

---

## Build Verification

```bash
cd /opt/processmap-test/frontend && npm run build
```

**Результат**: ✅ PASS  
**Время сборки**: 32.23s  
**Exit code**: 0  

```
✓ 1014 modules transformed.
✓ built in 32.23s
```

---

## Changed Files

```
frontend/src/components/process/BpmnStage.jsx                      | 1 +
frontend/src/features/process/bpmn/stage/orchestration/
  wireBpmnStageRuntimeEvents.js                                     | 67 +++++++++++++
frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js       | 1 +
3 files changed, 68 insertions(+), 1 deletion(-)
```

---

## Dev Server Status

**Примечание**: dev server (`:5177`) не запущен в данной сессии. Frontend собран статически (`dist/`). Для полного runtime proof с реальным FPS-измерением требуется:

1. `cd frontend && npm run dev -- --port 5177`
2. Открыть диаграмму с 428 элементами
3. 3-секундный pan с записью Performance panel
4. Сравнение long tasks до/после

---

## Console Check (static build)

Сборка не выдала ошибок компиляции или линтинга. Динамическая проверка console на `:5177` требует запущенного dev server.

---

## Screenshot References

- Скриншоты Performance panel будут добавлены при ручном runtime verification
