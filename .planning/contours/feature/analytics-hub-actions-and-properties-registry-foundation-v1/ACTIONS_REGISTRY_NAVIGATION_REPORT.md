# ACTIONS_REGISTRY_NAVIGATION_REPORT

Статус: `DONE`

## Навигация

- Existing direct Product Actions Registry routes remain backward-compatible.
- New Analytics route opens `Реестр действий` as inner module.
- `onClose` from page mode returns to `Аналитика`, not to a separate export/shell surface.
- Workspace/project/session scopes remain wired through existing registry handlers.

## Visual rules

Page-mode `Реестр действий с продуктом`:

- one white content container;
- no gradient background on page panel;
- no dotted workspace notice border;
- no internal shadow on page panel;
- summary/table rows use transparent backgrounds and light separators;
- CSV/XLSX remain in header;
- AI controls remain in the primary registry area.

## Non-goals preserved

- No Product Actions durable truth mutation.
- No BPMN XML mutation.
- No fake rows.
