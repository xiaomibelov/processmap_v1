# VERSION_UPDATE_LEDGER_PROOF — fix/diagram-interaction-mode-visual-regression-v1

**Run ID:** 20260516T224839Z-35866

---

## Исходное состояние

- `frontend/src/config/appVersion.js`: `currentVersion: "v1.0.133"` (уже изменён в рабочей ветке)
- `build-info.json`: `v1.0.132`, `contourId: perf/diagram-human-perceived-pan-and-drag-smoothness-v1`
- Footer runtime: `Версия v1.0.132`

## Целевое состояние

- `frontend/src/config/appVersion.js`: `currentVersion: "v1.0.133"`
- Changelog (русский): «Исправлена визуальная регрессия BPMN-задач: восстановлен чистый стиль fill/stroke/текста, убран белый flash при pan/drag.»
- `build-info.json` после сборки: `v1.0.133`
- Footer runtime после деплоя: `Версия v1.0.133`

## Изменения, внесённые в Part 1

Файл `frontend/src/config/appVersion.js`:
- Обновлён changelog для v1.0.133 согласно спецификации контура.

## Проверки для Part 2

- [ ] `npm run build` проходит
- [ ] `build-info.json` содержит `v1.0.133`
- [ ] Footer показывает `Версия v1.0.133`
- [ ] Маркер версии НЕ на canvas
