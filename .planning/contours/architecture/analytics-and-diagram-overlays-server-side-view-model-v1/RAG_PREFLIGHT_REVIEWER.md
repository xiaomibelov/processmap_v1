# RAG preflight Reviewer

Run ID: `20260519T090224Z-17699`

## Command

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "architecture/analytics-and-diagram-overlays-server-side-view-model-v1" --area "analytics diagram overlays server-side view-model review" --format md --top-k 5
```

## Status

`PASS`

## Summary used

- Reviewer must independently validate source/runtime truth.
- Runtime proof is mandatory for UI/runtime contours; this contour is architecture/source-review only.
- Prior diagram review failures mean overlay DOM/rendering cost must stay separate from backend data computation.
- No `REVIEW_PASS` if source truth does not match submitted artifacts.
- RAG remains read-only context.

