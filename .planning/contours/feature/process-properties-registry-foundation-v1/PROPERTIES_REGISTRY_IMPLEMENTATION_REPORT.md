# PROPERTIES_REGISTRY_IMPLEMENTATION_REPORT

Статус: `DONE`

## Реализовано

- Добавлена страница `Реестр свойств`.
- Добавлен route surface `process-properties-registry`.
- Добавлены route helpers:
  - `readProcessPropertiesRegistryRoute`;
  - `buildProcessPropertiesRegistryUrl`;
  - `buildProcessPropertiesRegistryCloseUrl`.
- В `ProcessStage` добавлено открытие/закрытие properties registry.
- В session scope страница читает только `draft?.bpmn_meta`.
- Workspace/project scope показывают honest foundation state без fake rows/counts.

## UI

- Header: `Реестр свойств`, subtitle, `Вернуться`.
- Scope selector: `Workspace / Проект / Сессия`.
- Metrics row: `Источников`, `Элементов`, `Свойств`, `Типов свойств`, `После фильтров`.
- Filters появляются только когда есть real rows.
- Table columns: `Объект`, `Свойство`, `Значение`, `Источник / процесс`, `Тип / группа`, `Статус`.
- One white surface, light separators, no gradients/dotted borders/nested cards for the new page.

## Code commit

```text
worktree: /opt/processmap-properties-registry-part1
branch: feature/process-properties-registry-foundation-v1-part1
commit: e412919c6e8a6227381c58362133430d2f570741
```
