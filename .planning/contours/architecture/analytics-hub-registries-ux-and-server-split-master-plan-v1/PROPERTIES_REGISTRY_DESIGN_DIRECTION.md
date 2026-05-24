# Product Properties Registry design direction

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`

## Status

`Реестр свойств` является proposed Analytics module. В текущем контуре нельзя утверждать, что durable properties registry уже существует. Все группы ниже являются design direction until source-truth inventory.

## Product role

`Реестр свойств` отвечает на вопросы:
- какие свойства процесса известны;
- к какой сущности они относятся;
- откуда они взяты;
- насколько они полны/надежны;
- где они используются в BPMN/process/runtime overlays;
- какие свойства являются confirmed, derived, missing, conflict или hypothesis.

Он отличается от `Реестра действий`:
- actions registry описывает действия/события/product operations;
- properties registry описывает attributes/properties/classification of process entities.

## Proposed page structure

1. Header:
   - `Реестр свойств`;
   - короткое назначение;
   - back to Analytics Hub;
   - статус data model: confirmed/partial/proposed.
2. Scope bar:
   - Workspace / Проект / Сессия;
   - same interaction language as Actions Registry.
3. Compact metrics:
   - properties total;
   - confirmed;
   - derived;
   - missing/conflict;
   - after filters.
4. Grouped registry:
   - group by property group/type;
   - row summary + expandable detail.
5. Detail/source trace:
   - target entity;
   - source;
   - confidence/status;
   - related BPMN/process context.
6. AI/RAG read-only support:
   - explain property;
   - suggest filters;
   - warn about conflicts;
   - no save/apply.

## Proposed property groups

| Group | Examples | Status |
|---|---|---|
| BPMN structural | element id, element type, lane/pool, sequence relation | Proposed until source inventory |
| BPMN semantic | role labels, actor labels, event semantics, exception markers | Proposed |
| Runtime overlays | analytics layer flags, selection/derived actor overlays, notes by element | Proposed |
| Product/process metadata | workspace/project/session ownership, version/revision metadata | Proposed |
| Quality/completeness | missing label, missing actor, source conflict, incomplete mapping | Proposed |
| AI/RAG suggestions | suggested classification or explanation | Read-only proposed support |

## Source-truth labeling

Каждая row должна иметь один из статусов:
- `confirmed`: value comes from durable product data confirmed by source-truth contour;
- `derived`: deterministic runtime derivation from confirmed data;
- `missing`: expected value absent;
- `conflict`: multiple sources disagree;
- `hypothesis`: non-durable proposal or AI/RAG suggestion;
- `future`: field planned but not implemented.

## First implementation contour recommendation

Phase 2 should not start with schema migration. Recommended first slice:
- source-truth inventory for existing BPMN/process/session fields;
- read-only UI skeleton matching actions registry hierarchy;
- small derived dataset from confirmed fields only;
- explicit badges for unsupported/future properties;
- tests that prevent AI/RAG suggestions from being saved as confirmed properties.

## Risks to guard

- Смешать confirmed durable properties and AI suggestions.
- Создать еще одну wide flat table без grouping.
- Начать backend schema/API promise без source-truth inventory.
- Использовать BPMN XML as mutation target.
- Скопировать actions registry blindly without property-specific grouping.
