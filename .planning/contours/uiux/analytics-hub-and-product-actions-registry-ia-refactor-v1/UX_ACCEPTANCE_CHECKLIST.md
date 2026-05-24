# UX acceptance checklist

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`

## Analytics Hub

- [ ] Страница `Аналитика` остается top-level surface.
- [ ] Видны карточки `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- [ ] `Реестр действий` визуально ведет в redesigned registry и не теряется среди равных placeholders.
- [ ] `Реестр свойств` остается placeholder/card, без fake implementation.
- [ ] Global shell/header/sidebar не редизайнится.

## Product Actions Registry structure

- [ ] `Вернуться` ясно читается как navigation back to Analytics Hub.
- [ ] Page title и краткий контекст видны до таблицы.
- [ ] `Workspace`, `Проект`, `Сессия` являются тремя distinct scope blocks.
- [ ] Scope blocks полезны: показывают current value, отсутствующее значение или disabled/empty state.
- [ ] Metrics compact и не конкурируют с таблицей.
- [ ] Filters/actions/AI controls находятся в primary area до таблицы.
- [ ] CSV/XLSX остаются compact utility actions.
- [ ] Table является главным визуальным и смысловым контентом.
- [ ] `Источники данных` визуально отделены от main registry surface.
- [ ] Sources section вторична, но не спрятана.

## Empty workspace scope

- [ ] Empty workspace scope показывает title.
- [ ] Empty workspace scope показывает scope.
- [ ] Empty workspace scope показывает metrics shell/zero metrics без fake values.
- [ ] Empty workspace scope показывает filters/actions/AI area.
- [ ] Empty workspace scope показывает table headers или deliberate empty table shell.
- [ ] Empty workspace scope показывает empty-state message.
- [ ] Pagination shell присутствует только если это соответствует текущему компоненту.

## Populated project scope

- [ ] Existing rows отображаются без fake data.
- [ ] Filters не ломают counts/table.
- [ ] Export controls остаются доступными.
- [ ] Sources указывают реальные текущие источники/сессии из existing data flow.
- [ ] Layout остается понятным на desktop widths, включая 1280px.

## Row detail

- [ ] Если row expansion реализован: строка или chevron открывает detail area.
- [ ] Detail показывает только существующие row/source fields: source session, process step, tags/status/metadata если они уже доступны.
- [ ] Detail не является editor.
- [ ] Detail не пишет durable data.
- [ ] Если row expansion не реализован: отчет объясняет почему и оставляет clear extension point.

## AI controls

- [ ] AI controls находятся в primary action/filter area, не в sources section.
- [ ] AI controls остаются read-only support.
- [ ] Нет auto-write, auto-apply, BPMN mutation или Product Actions mutation.
- [ ] AI/RAG output не маркируется как canonical durable truth.
