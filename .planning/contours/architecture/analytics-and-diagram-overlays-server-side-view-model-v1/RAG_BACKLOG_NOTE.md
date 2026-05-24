# RAG backlog note

Run ID: `20260519T090224Z-17699`
Status: `BACKLOG_ONLY`

## Decision

RAG auto-indexing and nightly indexing are not part of this architecture execution lane. They remain backlog/future work.

## Reason

The current contour is bounded to source-truth architecture for server-side analytics and diagram overlay view-models. Adding RAG indexing would mix a tooling/data-freshness contour with analytics API migration and would increase mutation/operational risk.

## Backlog target

Suggested future contour:

```text
backlog/rag-ai-assisted-analytics-readonly-v1
```

Possible future scope:

- scheduled read-only indexing of approved source snapshots;
- manual reindex command;
- freshness metadata in admin/reporting surfaces;
- read-only suggestions for analytics discovery.

Forbidden without a separate approved contour:

- RAG auto-mutating files;
- RAG writing BPMN XML;
- RAG applying Product Actions;
- AI suggestions becoming canonical source truth without explicit review/apply.

