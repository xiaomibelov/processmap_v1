# SOURCE_MAP_WORKER_2

Контур: `feature/process-properties-registry-foundation-v1`  
Статус: `DONE`

## Confirmed current source

| Source | Файл | Runtime path | Использование |
| --- | --- | --- | --- |
| Camunda extension properties/listeners в `bpmn_meta.camunda_extensions_by_element_id` | `frontend/src/features/process/camunda/camundaExtensions.js` | `ProcessStage` передаёт `draft?.bpmn_meta` в `ProcessPropertiesRegistryPage` только для session scope | Read-only строки таблицы для текущей сессии |

Field mapping:

| Registry field | Mapping |
| --- | --- |
| `Объект` | `elementId` из `camunda_extensions_by_element_id` |
| `Свойство` | `extensionProperties[].name` или `listener event/type` |
| `Значение` | `extensionProperties[].value` или `extensionListeners[].value` |
| `Источник / процесс` | title текущей сессии + source kind |
| `Тип / группа` | `Camunda property / extensionProperties` или `Camunda listener / extensionListeners` |
| `Статус` | `Есть значение` / `Нет значения` |

## Available but not suitable for this contour

- Property overlay preview/decor: визуальный runtime layer, не durable registry truth.
- Existing property panel draft models: tied to selected element/edit surface, not page-safe aggregate.
- `robot_meta_by_element_id`: есть в `bpmn_meta`, но semantic mapping to properties registry не подтверждён в этом contour.
- DoD/quality/role/lane/equipment/product-related fields: есть в других models, но source shape и registry semantics не доказаны.

## Hypothesis/future

- Unified process object properties across BPMN, overlays, interview analysis and process step metadata.
- Workspace/project properties registry from aggregated session metadata.

## Requires backend/API work later

- Workspace/project aggregate over `bpmn_meta_json / nodes_json / edges_json`.
- API contract for safe read-only properties registry query and pagination.

## Explicitly not suitable

- Product Actions registry data: отдельная durable truth (`interview.analysis.product_actions[]`), не источник `Реестр свойств`.
