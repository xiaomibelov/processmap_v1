# Product Actions Registry redesign options

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`

## Current confirmed surface

Подтверждено чтением кода:
- UI entry: `ProductActionsRegistryPanel.jsx`;
- subcomponents: `ProductActionsRegistryHeader`, `ProductActionsRegistryMetrics`, `ProductActionsRegistryFilters`, `ProductActionsRegistryTable`, `ProductActionsRegistryPagination`;
- scopes: workspace, project, session;
- current table columns: продукт, действие, процесс/шаг, статус;
- summary metrics: sessions, rows, complete, incomplete, after filters;
- backend query/export exists;
- source diagnostics include sessions summary and project/session selection;
- bulk AI suggestions exist for workspace/project and selected sessions.

## Option A: compact table cleanup

Состав:
- оставить flat table;
- усилить header/scope/metrics hierarchy;
- сделать metrics compact rail;
- sources оставить в secondary block;
- AI controls перенести ниже primary table или в right/support panel.

Плюсы:
- минимальный implementation risk;
- не требует нового data model;
- хорошо подходит для Phase 1.

Минусы:
- row-level explanation все еще слабая;
- missing fields/source/evidence остаются неочевидными.

Вердикт: можно делать как first slice, но это не финальная модель.

## Option B: table + expandable rows

Состав:
- table row остается компактной;
- row expands into details: source, missing fields, confidence, evidence, BPMN element, session/project path, related actions;
- incomplete row получает clear remediation hint;
- AI explanation affordance живет внутри expanded detail как read-only help.

Плюсы:
- решает основную проблему flat table без route complexity;
- можно реализовать на текущих row fields;
- хорошо отделяет summary от detail;
- подходит для empty/populated states.

Минусы:
- нужно аккуратно протестировать mobile/desktop layout;
- при богатом detail может стать тяжелым.

Вердикт: recommended Phase 1 target.

## Option C: master-detail side panel

Состав:
- table/list слева;
- selected row detail справа;
- AI/RAG explanation и source trace в panel.

Плюсы:
- лучше для сложной аналитики и сравнения строк;
- масштабируется до properties registry.

Минусы:
- выше scope для Phase 1;
- требует устойчивой selected-row state model и responsive behavior;
- может потребовать больше design/runtime validation.

Вердикт: defer до момента, когда expandable rows станут тесными.

## Option D: separate row detail route

Состав:
- каждая registry row получает route/entity page.

Плюсы:
- хорошо для audit, share links, deep linking.

Минусы:
- нужен стабильный entity id/API contract;
- преждевременно для текущего architecture contour.

Вердикт: later, после server-side view-model contract.

## Recommended Phase 1 slice

1. Закрепить page skeleton: header, scope, compact metrics, filters, registry, sources.
2. Сжать metrics до rail/chips:
   - `Строк`;
   - `Полных`;
   - `Неполных`;
   - `После фильтров`;
   - sessions count как scope/support metadata.
3. Реализовать expandable row:
   - `Источник`: workspace/project/session, source field, updated_at;
   - `Связь с процессом`: session title, step label, step id, BPMN id;
   - `Полнота`: missing fields;
   - `Evidence`: confidence/source/evidence if present.
4. Перенести AI suggestions из primary flow в support area:
   - для future RAG: only explain/filter/export suggestions;
   - existing accept flow должен оставаться explicit user action and clearly not RAG auto-apply.
5. Сохранить `Источники данных` как secondary diagnostics, но добавить compact source summary возле scope.

## Explicit non-goals for Phase 1

- Не менять durable source truth `interview.analysis.product_actions[]`.
- Не писать Product Actions в BPMN XML.
- Не добавлять schema migration.
- Не переносить все фильтры server-side в этом UI contour.
- Не делать AI/RAG auto-apply.

## UX validation checklist

- Desktop 1280px: header, scope, metric rail, filters and first rows visible without excessive scroll.
- Empty workspace/project/session states use same shell as populated states.
- Incomplete row explains missing fields without opening source diagnostics.
- AI controls cannot be mistaken for required next step.
- Export controls remain accessible but do not dominate the header.
