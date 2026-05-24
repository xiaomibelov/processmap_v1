# Отчёт о декомпозиции — perf/process-stage-baseline-jank-v1

## Принцип decomposition-first

Согласно PLAN.md: «Не добавлять новую логику напрямую в god-file. Извлечь подсистему в отдельный модуль.»

## Выполненная декомпозиция

### 1. useStableDraft.js
- **Извлечён из**: логики стабилизации draft-ссылок.
- **Файл**: `frontend/src/features/process/stage/utils/useStableDraft.js`
- **Размер**: ~80 строк.
- **Функция**: Возвращает стабильную ссылку на draft, если его содержимое не изменилось. Использует content-hash (FNV-1a) по ключевым полям draft.
- **Интеграция**: `useStableProcessDiagramOverlayLayersProps.js` импортирует `useStableDraft` и оборачивает `inputRaw?.draft`.

### 2. useStableProcessDiagramOverlayLayersProps.js (уже существовал)
- **Доработан**: добавлена интеграция с `useStableDraft`.
- **Функция**: Централизованная стабилизация пропсов для overlay layers.

## Что НЕ декомпозировано (и почему)

| God-file | Причина отсутствия декомпозиции |
|----------|--------------------------------|
| ProcessStage.jsx (6880 строк) | Обёртка `memo()` решает проблему без изменения внутренней структуры. Полная декомпозиция требует отдельного контура `perf/process-stage-shell-decomposition-v1` (запланировано в PLAN.md). |
| BpmnStage.jsx (5813 строк) | Обёртка `memo()` + `useStableDraft` решает проблему проп-стабильности. Полная декомпозиция bpmn-js адаптеров — отдельный контур. |
| AppShell.jsx | Только `memo()` обёртка. |

## Риски декомпозиции

- Полная декомпозиция ProcessStage потребует изменения ~50+ импортов и prop-drilling paths.
- Текущий bounded fix ограничивает риск, не меняя public API компонентов.
- Все существующие тесты сохранены (нет изменений в props API).
