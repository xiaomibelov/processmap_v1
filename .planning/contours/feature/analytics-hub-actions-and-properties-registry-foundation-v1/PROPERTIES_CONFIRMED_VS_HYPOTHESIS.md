# Properties: confirmed vs hypothesis

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

| Категория | Статус | Evidence | Разрешение в этом контуре |
| --- | --- | --- | --- |
| BPMN element properties | confirmed current source | `buildBpmnPropertiesOverlaySchema.js`, `useBpmnPropertiesOverlayController.js` | Можно упомянуть как подтвержденный source; не делать fake rows. |
| Camunda/Zeebe extension properties | confirmed current source | `propertyDictionaryModel.js`, `extractCamundaZeebePropertyEntries.js` | Можно показать как planned/read-only category, если implementation lane безопасно берет real data. |
| Overlay/property tags visible on diagram | confirmed current source | `buildPropertiesOverlayPreview()`, `propertiesOverlayAlwaysEnabled` wiring | Можно считать source для будущей registry integration. |
| Product/process attributes | hypothesis | Product Actions source подтвержден, но это другой domain | Не смешивать с `Реестр действий`; без отдельного source показывать только placeholder category. |
| Process step metadata | hypothesis | `processStageHelpers.js` читает `interview.steps`, `path_spec.steps` | Требует отдельного registry design/API before real table. |
| DoD/quality properties | confirmed current source | `useDiagramDodQualityModel.js`, DoD/coverage helpers | Можно указать как current quality domain; не выдавать как full properties registry. |
| Lane/role properties | hypothesis | `lane/role` встречаются в step helpers and Product Actions rows | Требует source unification and naming decision. |
| Location/equipment properties | future backend/API requirement | В проверенном source не найден durable источник | Только future placeholder. |
| Product-related properties outside actions | future backend/API requirement | Нет отдельной durable truth вне `product_actions[]` | Не реализовывать в этом контуре. |

## Decision

`Реестр свойств` в текущем контуре должен быть honest foundation. Full registry с counts/table допустим только после отдельного source-truth/API contour.
