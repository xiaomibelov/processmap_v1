# RAG Preflight Reviewer

- run_id: `20260527T194532Z-14649`
- contour: `fix/bpmn-properties-parser-audit-v1`
- generated_by: `processmap-agent-pane.sh`
- generated_at: `2026-05-27T19:47:49Z`
- command: `node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "fix/bpmn-properties-parser-audit-v1" --area "ProcessMap planning context" --format md --top-k 5`

## Structured Facts

### Agent Rules
- [critical] RAG is read-only suggestion/context layer
- [critical] Agent 3 Reviewer must use GSD discipline
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work
- [high] Agent 3 must test the exact user scenario

### Contour Facts
- Previous properties registry contour (`feature/process-properties-registry-foundation-v1`) reached REVIEW_PASS for UI foundation but backend aggregate was missing.
- This contour is a fix/parser audit, not a feature build.

### Decisions
- RAG is read-only suggestion and context layer.
- RAG must not auto-mutate any file.

### Required Gates
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Bounded scope defined in PLAN.md
- [ ] Acceptance criteria defined
- [ ] No product code written by Agent 1

### Warnings
- No runtime facts matched query — runtime proof may be missing.
