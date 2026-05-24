# FACTS_TO_RAG_BRIDGE_REPORT

**Contour:** `feature/processmap-agent-rag-structured-facts-registry-v1`
**Date:** 2026-05-16

---

## Prototype Implementation

`tools/rag/pm-rag-facts-to-context.mjs`

## Purpose

Compose a deterministic preflight context block from structured facts, then optionally append supporting BM25 document snippets.

## Usage

```bash
node tools/rag/pm-rag-facts-to-context.mjs --role <planner|executor|reviewer> --query "..." [--append-bm25]
```

## Workflow

1. Load all facts from `tools/rag/facts/`
2. Tokenize query into lowercase terms
3. Score each fact by term frequency across all JSON fields
4. Apply role boost:
   - `agent_rule` matching role: +3
   - `bottleneck_fact` for planner: +2
   - `user_rejection_fact` for reviewer: +3
   - `validation_fact` for reviewer: +2
   - `runtime_fact`: +1
5. Apply status boost: active +1, draft -2
6. Select top 10 facts
7. Categorize into structured sections
8. Optionally run `pm-rag-search-facts.mjs` for BM25 supplement

## Output Sections

- ### Agent Rules
- ### Runtime Facts
- ### User Rejections (override formal passes)
- ### Contour Facts
- ### Decision Facts
- ### Validation Facts
- ### Bottlenecks
- ### Source References
- ### Supporting BM25 Snippets (if `--append-bm25`)

## Tested Examples

### 1. Planner Query
```bash
node tools/rag/pm-rag-facts-to-context.mjs --role planner --query "Plan next Diagram lag contour"
```

Returns:
- Relevant agent rules (no product changes in RAG, RAG read-only)
- Contour facts for 4 Diagram contours (3 not_solved, 1 solved)
- Bottlenecks: drag lag remained, React 95% CPU
- Next recommended contour: `perf/process-stage-baseline-jank-v1`

### 2. Reviewer Query
```bash
node tools/rag/pm-rag-facts-to-context.mjs --role reviewer --query "Review Diagram performance contour"
```

Returns:
- Agent rules: real drag test required, fresh 5180 runtime required
- 5 user rejection facts overriding formal REVIEW_PASS
- Validation facts: 7/7 PASS on review rules
- Source refs to profiler evidence and baselines

### 3. Policy Query
```bash
node tools/rag/pm-rag-facts-to-context.mjs --role all --query "What is forbidden for RAG"
```

Returns:
- Agent rules: no auto-mutation, no BPMN writes, no PR without command
- Decision facts: RAG read-only, no auto-mutate, no BPMN XML write
- Validation fact: q4-rag-forbidden-actions → PASS

### 4. Status Query
```bash
node tools/rag/pm-rag-facts-to-context.mjs --role all --query "Is BM25 ready for agent preflight"
```

Returns:
- Contour facts: source registry REVIEW_PASS, BM25 search REVIEW_PASS
- Bottlenecks: 3/7 → 7/7 improvement documented, next step is preflight integration
- Decision facts: RAG read-only, Product Actions truth source

## Limitations

- Bridge is a static prototype; no persistent caching
- BM25 append spawns subprocess; may be slow on large indexes
- Role boost weights are heuristic; not tuned per role
- No semantic matching; purely lexical

## Next Contour

`feature/processmap-agent-rag-agent-preflight-integration-v1`

Planned enhancements:
- Cache fact load across calls
- Integrate directly with `pm-rag-search.mjs` instead of subprocess
- Add `--contour` filter to prefill context for a specific contour
- Add `--format json` for machine-readable preflight blocks
- Hook into agent launcher scripts (agent1-planner, agent3-reviewer)
