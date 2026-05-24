# Концепт Product Properties Registry

## Purpose

`Реестр свойств` - proposed analytics registry for BPMN/process properties, overlays and attributes. Он должен отвечать на вопрос: какие свойства процесса известны, откуда они взяты, как классифицированы, насколько полны и где используются.

Это не то же самое, что `Реестр действий`:
- actions registry фокусируется на действиях/событиях/операционных строках;
- properties registry фокусируется на свойствах process entities and overlays.

## Proposed high-level data model

Статус: proposed model до подтверждения Worker 2.

| Entity | Meaning |
|---|---|
| Property item | Одно свойство/атрибут, связанный с process/BPMN/session/entity |
| Property group | Классификация: BPMN, runtime overlay, product metadata, AI-derived suggestion, quality/status |
| Target entity | BPMN element, lane/pool, process/session/project, action row, source artifact |
| Source | Durable field, derived runtime view, imported artifact, AI/RAG suggestion |
| Confidence/status | Confirmed, derived, missing, conflict, hypothesis |

## Candidate property groups

- BPMN structural properties: element type, id, name, lane/pool, sequence relation.
- BPMN semantic properties: roles, actor labels, boundary events, exceptions.
- Runtime overlays: selection, analytics layer flags, derived actors, notes by element.
- Product metadata: project/session/workspace ownership, version/revision metadata where applicable.
- Quality/completeness: missing label, missing actor, incomplete mapping, source conflict.
- AI/RAG suggestions: read-only proposed classification or explanation.

## Source-truth rule

Нельзя писать, что эти groups уже существуют как durable truth, пока Worker 2 это не подтвердит. В документах и следующих implementation contours нужно явно маркировать:
- `confirmed truth`;
- `derived runtime truth`;
- `hypothesis`;
- `proposed model`;
- `future source-of-truth to define`.

## UX direction

`Реестр свойств` должен жить в Analytics как отдельный module:
- entry card on Analytics Hub;
- own registry page;
- scope selector aligned with actions registry;
- grouping by property type/group;
- filters by source, confidence, target entity, completeness;
- detail view showing source and related BPMN/process context.

## Phase 2 first version

First version should be small:
- read-only UI;
- no schema migration unless separately approved;
- use confirmed/derived fields only;
- mark unsupported properties as future model;
- expose classification design even if data source is partial.

## Risks

- Смешать durable properties and AI suggestions.
- Превратить registry в еще одну flat table без hierarchy.
- Начать schema migration до утверждения source-of-truth.
- Пересечься с BPMN XML mutation contours.
