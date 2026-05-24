# RAG preflight - Reviewer

Команда:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1" --area "Analytics architecture UX registries server split review" --format md --top-k 10
```

## Status

RAG preflight completed successfully.

## Key findings

- Reviewer must use GSD discipline and independent validation.
- Reviewer must not approve UI/runtime contours on synthetic proof only.
- User-visible failures override formal `REVIEW_PASS`.
- AI drafts are not canonical source truth.
- RAG remains read-only and must not auto-mutate.

## Review impact

Agent 4 review must check that:
- worker evidence separates confirmed facts from hypotheses;
- user complaints are directly addressed;
- master plan is concrete enough for follow-up implementation contours;
- AI/RAG remains safe and read-only;
- server split is phased, not hand-waved.
