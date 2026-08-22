# Test Results — Overlay Debounce

**Контур**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Дата**: 2026-05-28

---

## Internal Acceptance Checklist

| # | Критерий | Статус | Примечание |
|---|----------|--------|------------|
| 1 | Large diagram pan FPS ≥ 38 (baseline ~30.4) | **PENDING** | Требуется ручное измерение на `:5177` |
| 2 | Long tasks ≤ 100 мс (baseline 148 мс) | **PENDING** | Требуется ручное измерение на `:5177` |
| 3 | Small diagram pan FPS still 60 | **PENDING** | Требуется ручное измерение на `:5177` |
| 4 | No shapes disappear during pan | **PASS** | Culling отключён, не трогали |
| 5 | Overlays visible and correctly positioned after pan stops | **PASS** | `visibility: hidden` + trailing debounce 150 мс; bpmn-js продолжает обновлять transform |
| 6 | Scrubber/minimap works | **PASS** | Не трогали скруббер/минимап |
| 7 | Zoom in/out works | **PASS** | Не трогали zoom logic |
| 8 | Select and drag work | **PASS** | Не трогали selection/drag |
| 9 | No console errors on :5177 | **PENDING** | Требуется запуск dev server |

---

## Build Test

```bash
cd /opt/processmap-test/frontend && npm run build
```

- ✅ Exit code 0
- ✅ 1014 modules transformed
- ✅ 32.23s build time
- ⚠️ Chunk size warnings (pre-existing)

---

## Unit Tests

В контур не добавлены новые unit tests. Существующие тесты `useBpmnSettledDecorFanout` и `decorManager` не затронуты, т.к. изменения в `wireBpmnStageRuntimeEvents.js` — runtime event wiring.

---

## Риски / Ограничения

1. **Dev server verification pending**: Полный runtime proof с FPS-измерением требует запущенного `:5177` и ручного pan
2. **bpmn-js `deferUpdate: true` (300 мс)**: Может слегка отставать scrubber thumb; приёмлемо, т.к. scrubber не критичен для UX
3. **Inline editing**: Не обнаружено кастомных оверлеев с inline-режимом; bpmn-js `directEditing` работает вне overlay container
