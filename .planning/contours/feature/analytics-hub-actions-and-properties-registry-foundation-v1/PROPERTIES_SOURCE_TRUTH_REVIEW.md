# Source-truth review: `Реестр свойств`

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Роль: Agent 3 / Worker 3

## Проверенные источники

### BPMN element properties

Подтвержден частичный frontend/runtime source:

- `frontend/src/features/process/bpmn/context-menu/properties-overlay/buildBpmnPropertiesOverlaySchema.js`
  - строит rows для `Название`, `Документация`, Camunda extension properties, `Robot Meta`;
  - получает `elementId`, `elementName`, `bpmnType`.
- `frontend/src/features/process/bpmn/context-menu/properties-overlay/useBpmnPropertiesOverlayController.js`
  - открывает overlay через `open_properties`;
  - умеет сохранять name/documentation/extension rows через diagram context action.

Для Properties Registry это source evidence только для element-level properties. Это не готовый read-only registry API.

### Camunda/Zeebe extension properties

Подтвержден частичный frontend source:

- `frontend/src/features/process/camunda/propertyDictionaryModel.js`
  - нормализует extension properties;
  - строит overlay preview rows;
  - поддерживает schema/custom rows.
- `frontend/src/features/process/stage/search/extractCamundaZeebePropertyEntries.js`
  - извлекает Camunda/Zeebe scalar и extension entries из BPMN businessObject.
- `frontend/src/features/session-meta/write/sessionMetaMergePolicy.js`
  - читает `camunda_extensions_by_element_id` из session meta/local meta.

Это подтверждает наличие property-like данных, но не подтверждает единый durable backend registry.

### Overlay/property tags visible on diagram

Подтвержден частичный frontend source:

- `buildPropertiesOverlayPreview()` возвращает preview items/hiddenCount/totalCount для diagram overlay.
- `ProcessStage` и `BpmnStage` используют `propertiesOverlayAlwaysEnabled` и `propertiesOverlayAlwaysPreviewByElementId`.

Это runtime overlay source, но не полноценная registry table truth.

### Product/process attributes

Подтверждено отдельно для Product Actions Registry:

- `backend/app/storage.py::list_product_action_registry_sources()` читает `interview.analysis.product_actions[]`.
- `backend/app/routers/product_actions_registry.py` строит registry rows и summary.
- `frontend/src/features/process/analysis/productActionsRegistryModel.js` нормализует rows, filters, completeness.

Для Properties Registry это не источник свойств. Нельзя переиспользовать `product_actions[]` как properties truth.

### Process step metadata

Подтвержден частичный frontend source:

- `frontend/src/features/process/stage/utils/processStageHelpers.js` строит route steps из `interview.steps` и `path_spec.steps`, включая `lane`, `bpmn_ref`, durations, notes.
- `frontend/src/features/notes/knowledgeTools.js` строит coverage matrix по nodes/notes/AI questions.

Это источник кандидатов для будущего registry, но unified read-only source сейчас не подтвержден.

### DoD/quality properties

Подтвержден partial runtime model:

- `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`
  - строит `diagramDodSnapshot`, `dodReadinessV1`, quality overlay catalog.
- `frontend/src/features/workspace/computeDodPercent.js` и explorer DoD UI существуют для workspace/project summary.

Это quality/coverage domain, не готовый Properties Registry API.

### Lane/role/location/equipment/product-related properties

- `lane/role` частично подтверждены через process step helpers and Product Actions rows field `role`.
- `location/equipment` как current durable source в проверенных файлах не подтверждены.
- Product-related properties сейчас подтверждены только в контексте Product Actions, не как общий property registry.

## Вывод

В текущем source есть несколько подтвержденных property-like sources, но нет доказанного единого backend/API durable source для `Реестр свойств`. Без дополнительной реализации безопасный результат этого контура: separate foundation page с honest structured placeholder и списком будущих групп, либо read-only shell только для строго подтвержденных frontend-visible categories.
