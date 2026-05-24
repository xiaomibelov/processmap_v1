# EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS

Контур: `uiux/product-actions-registry-single-surface-visual-system-v1`

## Scope model

Реестр должен явно сохранять разделение scope:

- `Workspace`: aggregated view по текущему workspace.
- `Проект`: project-level Product Actions.
- `Сессия`: session-level Product Actions.

Agent 4 проверяет не название реализации, а runtime behavior: выбранный scope должен менять только допустимый data slice и не должен смешивать строки из другой области.

## Populated registry

Ожидаемое состояние при наличии real Product Actions:

- Header, scope tabs, metrics, filters, AI row, warning row и table находятся в одном white container.
- Metrics отражают реальные visible/total values текущего scope.
- Filters уменьшают visible dataset без fake recomputation.
- Warning row появляется только если в текущем visible/scope dataset есть неполные элементы.
- Table показывает реальные строки Product Actions.
- Status badges соответствуют фактической полноте строк.
- Export controls доступны один раз в header и экспортируют текущую согласованную view согласно существующей логике.
- AI controls работают с видимым или выбранным набором согласно существующей семантике, без изменения AI behavior в этом контуре.

## Empty registry

Ожидаемое состояние при отсутствии Product Actions в scope:

- Single-container system сохраняется.
- Табличная область остается главным местом состояния, но показывает empty message вместо fake rows.
- Metrics показывают нули или корректное отсутствие данных.
- Warning row отсутствует, если нет неполных реальных строк.
- Filters не создают illusion, что данные есть.
- Export controls не дублируются и не создают fake file expectations.
- AI controls не должны заявлять обработку строк, которых нет.

## Scope tabs

- Active tab визуально однозначен.
- Inactive tabs доступны для переключения, если это поддержано текущим route/state.
- Tabs не выглядят disabled, если пользователь может ими пользоваться.
- Переключение tabs не должно сбрасывать страницу в Analytics Hub.

## Metrics row

- `Всего`, `полных`, `неполных`, `после фильтров` должны быть понятны за один взгляд.
- Если `после фильтров == всего`, metric должна быть subdued или визуально менее важной.
- Нельзя добавлять metric cards, colored backgrounds или icon-heavy decoration.

## Filters row

- В populated state filters должны быть compact и usable.
- В empty state filters не должны ломать layout; допустимы disabled/empty options только если это текущая корректная модель.
- `Сбросить фильтры` показывается как text action и должен иметь эффект только при active filters.

## AI row

- В populated state AI CTA и chips должны относиться к visible data, no-action data или incomplete data согласно labels.
- В empty state AI row не должен создавать впечатление, что есть скрытые строки для обработки.
- Purple accent не должен распространяться на metrics, warning или table chrome.

## Warning row

- В populated state warning помогает сфокусироваться на incomplete rows.
- В empty state warning не нужен.
- Link `Показать только неполные` допустим только если он использует существующий safe filter state.
