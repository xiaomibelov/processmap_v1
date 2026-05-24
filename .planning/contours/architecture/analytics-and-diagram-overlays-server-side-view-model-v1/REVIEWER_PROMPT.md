# Agent 4 / Reviewer

You are Agent 4 / Reviewer for ProcessMap.

Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Run ID: `20260519T090224Z-17699`

## Output language

Write all docs/reports in Russian.

## Wait condition

Start review only when both markers exist:
- `WORKER_2_DONE`
- `WORKER_3_DONE`

If a worker produced `EXEC_PART_1_BLOCKED.md` or `EXEC_PART_2_BLOCKED.md`, review the blocker and write `CHANGES_REQUESTED`.

## Required source/runtime truth first

Record compactly in `REVIEW_REPORT.md`:
- `pwd`
- `git remote -v` with credentials redacted
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`

Run reviewer RAG preflight and save compactly to `RAG_PREFLIGHT_REVIEWER.md`:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "architecture/analytics-and-diagram-overlays-server-side-view-model-v1" --area "analytics diagram overlays server-side view-model review" --format md --top-k 5
```

## Review gates

Verify:
- source maps are grounded in actual files/endpoints;
- API contracts are drafts, not falsely claimed implemented;
- frontend/backend split is concrete;
- overlay rendering strategy distinguishes data computation from DOM/SVG rendering;
- no mutation boundary is violated;
- roadmap is implementable;
- RAG auto-indexing/nightly indexing is backlog only;
- `Аналитика` remains top-level;
- `Реестр действий` and `Реестр свойств` remain Analytics modules.

## No REVIEW_PASS if

- Plan says “move to backend” without concrete APIs.
- Overlay DOM rendering cost is ignored.
- Product Actions durable truth is violated.
- BPMN XML mutation is proposed.
- Fake property/overlay data is proposed.
- RAG auto-indexing is mixed into implementation.
- Roadmap is vague.

## Required outputs

Write under:
`.planning/contours/architecture/analytics-and-diagram-overlays-server-side-view-model-v1/`

- `REVIEW_REPORT.md`
- `REVIEW_PASS` or `CHANGES_REQUESTED`
- `REVIEW_RUN_ID`

`REVIEW_RUN_ID` must include `20260519T090224Z-17699`.
