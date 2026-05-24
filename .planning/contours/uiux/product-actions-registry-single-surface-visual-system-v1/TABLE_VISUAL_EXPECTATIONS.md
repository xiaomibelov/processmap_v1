# TABLE_VISUAL_EXPECTATIONS

Контур: `uiux/product-actions-registry-single-surface-visual-system-v1`

## Table-first requirement

Таблица должна быть главным рабочим объектом страницы. Header, metrics, filters, AI и warning должны помогать таблице, а не превращаться в отдельные dashboard blocks.

## Structural expectations

- Table находится внутри того же white registry container.
- Перед table допустим separator, но не отдельная card shell.
- Table header визуально calm: background `#FAFAFA`, text uppercase `#6B7280`.
- Rows имеют light separators.
- Hover state subtle `#FAFAFA`.
- Нет zebra striping.
- Нет dense colored backgrounds.
- Нет внутренних shadows.

## Column readability

Agent 4 проверяет, что таблица читается без горизонтального визуального шума:

- primary action/name fields имеют достаточную ширину;
- BPMN code или technical identifiers subdued;
- role/type/category tags выглядят как compact gray chips;
- long text не перекрывает соседние controls;
- row height не скачет от hover, badges или chips;
- visible table не становится меньше по значимости, чем metrics или warning.

## Status badges

- `Полная`: green signal только внутри badge, background `#ECFDF5`, signal `#10B981`.
- `Неполная`: orange signal только внутри badge, background `#FFFBEB`, signal `#F59E0B`.
- Status badges являются единственными strong green/orange elements в table.
- Metrics и other UI не копируют эти badge colors как decoration.

## Selection and checkboxes

- Checkboxes нельзя добавлять только ради визуального сходства с таблицей.
- Если runtime уже имеет supported selection model, Agent 4 проверяет, что selected counter и AI actions отражают реальный selection state.
- Если selection model отсутствует, table остается без checkboxes, а AI toggle chips работают по existing visible/incomplete/no-action semantics.

## Sticky header

Sticky header допустим только при доказанной safety:

- не перекрывает app shell или controls;
- не ломает table scroll;
- не создает duplicate header;
- не ломает mobile width;
- не вызывает layout shift.

Если safety не доказана, отсутствие sticky header не является failure.

## Empty table state

- Empty state находится в table area или в ее спокойном placeholder.
- Нет mock rows.
- Нет fake Product Actions.
- Empty state не должен выглядеть как error, если отсутствие данных является валидным scope result.

## Review failure examples

- Table выглядит как второстепенный блок после больших colored panels.
- Table wrapped в отдельную shadow card внутри основного container.
- Status colors продублированы в metrics/cards.
- Warning banner визуально сильнее table.
- Header/exports занимают больше внимания, чем table content.
