# План foundation для `Реестр свойств`

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Цель

Создать первый безопасный upper-level entry/page для `Реестр свойств`, не реализуя полный registry system.

## Обязательная page

- Title: `Реестр свойств`.
- Description: `Сводный список свойств BPMN-элементов и процессных объектов.`
- Страница отделена от `Реестр действий`.
- Страница не показывает fake rows/counts.

## Разрешённая реализация

Если source/runtime доказывает real property data:

- можно показать minimal read-only shell/table;
- row/count values должны быть derived from confirmed source;
- источник должен быть указан в report.

Если unified source не доказан:

- показать structured placeholder;
- перечислить planned groups/types;
- явно указать, что единый источник ещё не подтверждён;
- не показывать fake counts/rows.

## Категории для проверки

- BPMN element properties.
- Overlay/property tags visible on diagram.
- Product/process attributes.
- Process step metadata.
- DoD/quality properties.
- Lane/role/location/equipment/product-related properties.

## Boundary

- Не мутировать BPMN XML.
- Не добавлять backend/schema implementation.
- Не использовать Product Actions durable truth как properties truth.
- Не писать RAG runtime/indexer.
- Не добавлять AI auto-write.
