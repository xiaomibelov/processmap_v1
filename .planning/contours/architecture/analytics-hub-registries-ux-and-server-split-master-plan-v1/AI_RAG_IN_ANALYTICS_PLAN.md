# AI/RAG in Analytics plan

## Boundary

AI/RAG в Analytics - read-only слой помощи. Он не меняет BPMN XML, не применяет Product Actions, не сохраняет свойства и не выполняет auto-mutation.

## Safe use cases

| Use case | Allowed behavior |
|---|---|
| Contextual explanation | Explain row/property/source in human language |
| Filtering help | Suggest filters based on user intent |
| Interpretation | Explain action/property meaning and caveats |
| Search | Search over analytics entities and docs |
| Export assistance | Suggest export columns/format |
| Summarization | Summarize registry state and data gaps |
| Quality warnings | Flag possible missing/conflicting data as suggestions |

## Not allowed

- Auto-apply actions.
- Auto-edit BPMN XML.
- Auto-save property values.
- Treat RAG snippets as canonical product truth.
- Hide source/confidence.
- Replace deterministic validation.

## Placement in UX

Recommended placements:
- contextual side panel on registry pages;
- row/detail-level explanation affordance;
- Hub-level summary card for read-only insights;
- export preparation helper.

Avoid:
- large AI block before the user sees registry content;
- AI suggestions styled as mandatory actions;
- inline mutation buttons inside AI answers.

## Required metadata for AI outputs

- source/reference when available;
- confidence level;
- whether the statement is confirmed, inferred, or hypothesis;
- actionability level: explain/filter/export suggestion only.

## Phasing

- Phase 0: define AI/RAG policy in architecture.
- Phase 1: reposition existing AI suggestions on actions registry if present.
- Phase 2: properties registry can show AI suggestions only as separate read-only layer.
- Phase 3: server may prepare stable analytics summaries for AI context.
- Phase 4: implement AI/RAG-assisted analytics enhancements as its own contour.
