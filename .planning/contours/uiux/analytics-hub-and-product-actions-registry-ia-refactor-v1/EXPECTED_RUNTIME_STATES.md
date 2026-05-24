# Expected runtime states

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`

## Общий invariant

Для всех runtime states страница не должна выглядеть как один плоский список. Проверяемая структура:

1. Back navigation to Analytics Hub.
2. Title/purpose area.
3. Scope blocks: `Workspace`, `Проект`, `Сессия`.
4. Compact metrics.
5. Primary filters/actions/AI controls.
6. Main registry table or deliberate table shell.
7. Secondary sources section.

## Analytics Hub

Expected:

- Route открывается как top-level `Аналитика`.
- Видны карточки `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- `Реестр действий` является понятным primary entry в Product Actions Registry.
- `Реестр свойств` не притворяется реализованным registry: это placeholder/card for future work.
- Hub не становится marketing hero page и не редизайнит global shell/header/sidebar.

Fail:

- Product Actions Registry спрятан как случайная ссылка.
- Properties/Dashboards/Export показывают fake implemented state.
- Global shell/header/sidebar заметно меняются ради этого contour.

## Empty workspace scope

Expected:

- Page title and purpose видны.
- Scope blocks показывают отсутствие project/session как state, а не исчезают.
- Metrics показывают zero/empty shell только на основании реального empty state.
- Filters/actions/AI area остается видимой, но disabled/empty behavior объясняется UI state, а не fake rows.
- Table headers или deliberate empty table shell видны.
- Empty state сообщает, что в текущем scope нет действий.
- Sources section остается вторичной и не заполняется вымышленными sources.

Fail:

- Страница превращается в пустой серый экран.
- Empty state заменяет всю IA и скрывает scope/actions/table shell.
- Появляются demo rows, fake metrics или fake source sessions.

## Populated project scope

Expected:

- Existing rows загружаются из текущего data flow.
- Counts/metrics соответствуют реально отфильтрованному/полученному набору.
- Filters меняют отображение без mutation requests.
- CSV/XLSX export controls доступны как compact utilities.
- AI controls находятся до таблицы, рядом с фильтрами/actions, и остаются read-only.
- Sources section показывает реальные source/session references из existing data flow.
- На desktop width 1280px видны основные anchors без scroll gymnastics.

Fail:

- Counts расходятся с видимыми rows без объяснимой pagination/filter причины.
- Sources выглядят как главный registry content.
- AI controls находятся после sources или выглядят как apply/save surface.
- Export controls подменяют основную registry работу.

## Row expansion/detail state

Expected, если реализовано:

- Row affordance очевиден: chevron, раскрываемая строка или другой familiar control.
- Detail показывает только existing row/source fields: source session, process step, tags/status/metadata, confidence/source labels if already present.
- Detail is read-only.
- Detail close/collapse не меняет durable data.

Expected, если не реализовано:

- Implementation report объясняет, почему existing data fields insufficient или почему scope перенесен в future contour.
- Есть clear extension point без fake detail content.

Fail:

- Detail открывает editor.
- Detail пишет Product Actions/BPMN/session state.
- Detail содержит invented source/confidence/status.

## Sources section

Expected:

- `Источники данных` визуально отделены от main registry table.
- Section secondary: ниже таблицы или в side/auxiliary area with lower visual priority.
- Sources помогают traceability, но не конкурируют с row comprehension.

Fail:

- Sources смешаны с filters/table как равнозначные блоки.
- Sources используются для fake completeness/status.

## AI controls

Expected:

- AI controls в primary action/filter area.
- Text/labels make clear AI is support, not canonical truth.
- No auto-apply, no auto-write, no BPMN XML mutation, no Product Actions mutation.
- AI output, если есть, показывает source/confidence/status when supported by existing flow.

Fail:

- AI action запускает unsafe mutation during view/navigation.
- AI output маркируется как durable truth без human confirmation/data source.

## Export controls

Expected:

- CSV/XLSX actions compact and utilitarian.
- Exports operate on current real data/scope/filter model.
- Export controls do not require package install or backend/schema changes in this contour.

Fail:

- Export UI invents unavailable formats/statuses.
- Export action blocks primary registry scan.
