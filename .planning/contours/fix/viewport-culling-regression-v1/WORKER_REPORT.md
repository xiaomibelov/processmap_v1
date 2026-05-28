# WORKER REPORT — fix/viewport-culling-regression-v1

## Run ID
`20260528T172600Z-emergency`

## Статус
DONE — regression устранён, canvas стабилен.

## Что сделано

| # | Задача | Статус | Файл(ы) |
|---|--------|--------|---------|
| 1 | Диагноз culling | ✅ | `CULLING_DIAGNOSIS.md` |
| 2 | Отключение culling | ✅ | `BpmnStage.jsx` (2 строки закомментированы) |
| 3 | Проверка scrubber | ✅ | `SCRUBBER_FIX.md` |
| 4 | Build | ✅ | `npm run build` — 32.55s, без ошибок |
| 5 | Runtime test на :5177 | ✅ | `MANUAL_TEST_RESULTS.md` |

## Диагноз (кратко)
Viewport culling (`cullBpmnViewport.js`) использовал `gfx.remove()` — destructive DOM mutation.
При pan bpmn-js терял внутренние ссылки на gfx-узлы, что приводило к исчезновению ВСЕХ shapes.

## Fix (кратко)
Отключено создание `createViewportCuller()` в `BpmnStage.jsx` для viewer и modeler.
bpmn-js сам управляет видимостью off-screen элементов — дополнительное culling избыточно и destructive.

## Git
```
9dcbe05a fix(viewport-culling-regression): disable viewport culling to restore canvas stability
```

## Артефакты
- `CULLING_DIAGNOSIS.md`
- `FIX_APPLIED.md`
- `SCRUBBER_FIX.md`
- `MANUAL_TEST_RESULTS.md`
- `RUNTIME_PROOF_5177.md`

## Блокеры
Нет.

## Ограничения / Риски
- Performance на больших диаграммах (>1000 элементов) может быть хуже без culling.
- В будущем culling можно реализовать через bpmn-js API (например, `canvas.setRootElement()` с visibility flags) или CSS `content-visibility`.
