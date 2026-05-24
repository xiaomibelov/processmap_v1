# feature/processmap-agent-rag-structured-facts-registry-v1

## GSD Discipline

**GSD availability result:**
- `command -v gsd` → `/opt/processmap-test/bin/gsd`
- `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
- `PROCESSMAP_GSD_WRAPPER_FOUND` → Yes
- `CODEX_GSD_TOOLS_FOUND` → Yes
- `gsd-tools` commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init
- Skills found: 50+ gsd-* directories under `/root/.codex/skills`

**GSD mode:** `GSD_PROCESSMAP_WRAPPER_PLANNING`

**Discipline assertions:**
- Implementation not performed by Agent 1.
- Product runtime files not changed by Agent 1.
- Contour is bounded to structured facts registry, validator, lookup CLI, and bridge docs.
- RAG remains read-only.
- Structured facts are curated only — no auto-extraction from all docs as accepted truth.
- Agent 2 / Agent 3 gates prepared.

---

## Source / Runtime Truth

**Captured at:** 2026-05-16T16:22:46+00:00

| Property | Value |
|----------|-------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 8 pre-existing frontend files (unrelated to this contour) |
| `curl -s http://clearvestnic.ru:8088/health` | `{"ok":true,"status":"ok","redis":...}` |
| `curl -I http://clearvestnic.ru:5180` | HTTP/1.1 200 OK (nginx, no-cache) |

**Divergence note:** 8 modified frontend files are from `fix/lockfile-sync-test` and are unrelated to this contour. This contour creates only tooling/config/docs under `tools/rag/`, `docs/rag/`, `.planning/contours/<CID>/`, and Project Atlas. No product runtime changes.

---

## Previous RAG Source Truth

### Contour 1 — architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1
- Status: REVIEW_PASS
- Delivered: source inventory, RAG architecture, indexing policy draft, agent integration plan, validation queries, 4 implementation contours proposed.
- Reviewer: GSD discipline verified, 14 gates passed, no product code changes.

### Contour 2 — feature/processmap-agent-rag-source-registry-and-index-policy-v1
- Status: REVIEW_PASS
- Delivered: `tools/rag/processmap-rag-sources.json` (8 sources), `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md`, secrets scanner `pm-rag-scan-secrets.mjs`, manifest builder `pm-rag-build-manifest.mjs`, metadata schema, classifier rules.
- Secrets scan: 8 findings, all false positives (policy docs, i18n labels, test fixtures).
- Reviewer: 27/27 policy checks pass, no secrets printed, no product changes.

### Contour 3 — feature/processmap-agent-rag-bm25-manifest-search-v1
- Status: REVIEW_PASS (with caveat)
- Delivered: `pm-rag-build-search-index.mjs`, `pm-rag-search.mjs`, `pm-rag-run-validation-queries.mjs`, validation queries fixture.
- Validation: 3/7 pass on 500-file capped sample. Failures attributed to BM25 lexical limitations and sample coverage.
- Reviewer: independent 3/7 confirmed. No blockers — failures are corpus/ranking issues, not bugs.

### Contour 4 — feature/processmap-agent-rag-coverage-and-validation-hardening-v1
- Status: REVIEW_PASS
- Delivered: `--full` manifest mode, source-balanced coverage, improved ranking (word-boundary, canonical boost, prompt penalty, recency tiers).
- Validation: **7/7 PASS** on full manifest (1,803 files, all 8 sources represented).
- Secrets re-scan: 15 findings, all false positives/expected.
- Reviewer: independent 7/7 confirmed. Coverage report verified. No product changes.

**Key lesson:** Full manifest + balanced coverage + ranking improvements brought validation from 3/7 to 7/7. Structured facts should leverage this proven corpus but add deterministic, machine-readable curated facts on top.

---

## Problem Statement

Document RAG/BM25 answers:
- Where a report lives;
- What is written in a markdown file;
- Which snippets are similar to a query.

It does NOT reliably answer:
- Which contour was formally REVIEW_PASS but user-rejected;
- Which rules are mandatory for Agent 3;
- What the current runtime facts are;
- Which decisions forbid specific actions;
- Which next actions are tied to current bottlenecks;
- Which validation cases must pass.

Agents currently rely on BM25 snippets that may be:
- Generic (competing documents dilute specific facts);
- Stale (no deterministic freshness guarantee per fact);
- Ambiguous (formal REVIEW_PASS vs user-visible solved is not explicit).

**Structured Facts Registry solves this** by creating a curated, schema-validated, deterministic layer that agents query FIRST, before falling back to BM25 document search.

**Core principle:** `facts first → documents second`

---

## Implementation Scope

Agent 2 will implement within these bounds:

1. **Facts schema** (`tools/rag/facts/processmap-facts.schema.json`)
   - JSON Schema for all fact types.
   - Machine-readable, deterministic, validatable.
   - No package install.

2. **Initial curated facts** (7 types, JSON/NDJSON files)
   - runtime_fact, agent_rule, contour_fact, user_rejection_fact, decision_fact, validation_fact, bottleneck_fact.
   - Each fact has `id`, `type`, `status`, `source_refs`, `updated_at`.
   - Facts are curated by Agent 2 from previous contours, AGENTS.md, and runtime truth.
   - Draft/proposed facts explicitly marked `status: draft`.

3. **Facts validator** (`tools/rag/pm-rag-validate-facts.mjs`)
   - Schema validation, required fields, unique IDs, allowed types/status/severity.
   - source_refs point to existing local files where possible.
   - No secrets in fact values.
   - Draft-as-truth protection.
   - 18 validation checks (see §8 in prompt).

4. **Facts lookup/search CLI** (`tools/rag/pm-rag-search-facts.mjs`)
   - Simple lexical search over structured fields.
   - No embeddings, no vector DB.
   - Node built-ins only.
   - Ranked output with `why_matched`.

5. **Facts-to-RAG bridge** (`tools/rag/pm-rag-facts-to-context.mjs` or documented plan)
   - Static context composer for Agent 1/2/3 preflight.
   - Facts-first, docs-second workflow.
   - Examples for planner, reviewer, policy, and status queries.

6. **Project Atlas update**
   - `/srv/obsidian/project-atlas/ProcessMap/RAG/Structured Facts Registry.md`
   - `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Rules Facts.md`
   - `/srv/obsidian/project-atlas/ProcessMap/RAG/Contour Facts Index.md`
   - `/srv/obsidian/project-atlas/ProcessMap/RAG/Facts Validation Results.md`

7. **Contour reports**
   - FACTS_SCHEMA_REPORT.md
   - FACTS_REGISTRY_REPORT.md
   - FACTS_VALIDATION_REPORT.md
   - FACTS_LOOKUP_REPORT.md
   - FACTS_TO_RAG_BRIDGE_REPORT.md
   - SECRETS_AND_SAFETY_REPORT.md
   - RUNTIME_BEHAVIOR_IMPACT.md
   - IMPLEMENTATION_NOTES.md

---

## Structured Facts Definition

Structured facts are:
- **Curated**: hand-written or hand-verified by Agent 2 from source truth.
- **Deterministic**: same query → same fact set (no probabilistic retrieval).
- **Schema-bound**: every fact conforms to a typed JSON Schema.
- **Reference-linked**: every fact has `source_refs` pointing to origin documents.
- **Status-aware**: `active`, `superseded`, `rejected`, `draft`, `deprecated`.
- **Read-only**: no auto-mutation; no runtime write path.

Structured facts are NOT:
- Auto-generated truth from all documents.
- Embeddings or vector DB entries.
- Product runtime configuration.
- BPMN XML or code mutations.

---

## Fact Types / Schema Plan

### A. runtime_fact

```json
{
  "id": "string",
  "type": "runtime_fact",
  "project": "ProcessMap",
  "key": "string",
  "value": "string",
  "environment": "string",
  "source_refs": ["string"],
  "valid_from": "ISO",
  "status": "active | superseded | rejected | draft | deprecated",
  "confidence": "high | medium | low",
  "updated_at": "ISO"
}
```

Required initial facts:
- Server: clearvestnic.ru
- Root: /opt/processmap-test
- Frontend: http://clearvestnic.ru:5180
- API health: http://clearvestnic.ru:8088/health
- Project Atlas server: /srv/obsidian/project-atlas
- Project Atlas local: /Users/mac/Documents/Obsidian/ProjectAtlas
- Active contour root: /opt/processmap-test/.planning/contours/<CID>

### B. agent_rule

```json
{
  "id": "string",
  "type": "agent_rule",
  "role": "agent1 | agent2 | agent3 | all",
  "rule": "string",
  "condition": "string",
  "required_action": "string",
  "forbidden_action": "string",
  "severity": "critical | high | medium | low",
  "source_refs": ["string"],
  "status": "active | superseded | rejected | draft | deprecated",
  "updated_at": "ISO"
}
```

Required initial rules:
- Agent 1 must use GSD discipline.
- Agent 3 Reviewer must use GSD discipline.
- Agent 3 must verify fresh 5180 runtime for UI/runtime work.
- Agent 3 must test exact user scenario.
- REVIEW_PASS forbidden if user-visible failure remains.
- Diagram performance review must test real mouse drag, not only programmatic zoom/click.
- No PR/merge/deploy without explicit command.
- No product runtime code changes in RAG tooling contours.
- RAG is read-only.

### C. contour_fact

```json
{
  "id": "string",
  "type": "contour_fact",
  "contour_id": "string",
  "area": "string",
  "status": "active | superseded | rejected | draft | deprecated",
  "formal_verdict": "REVIEW_PASS | CHANGES_REQUESTED | REVIEW_BLOCKED | IN_PROGRESS",
  "user_visible_verdict": "solved | not_solved | unknown | not_tested",
  "user_accepted": "boolean",
  "version": "string",
  "main_findings": "string",
  "metrics": "object",
  "limitations": "string",
  "next_recommended_contour": "string",
  "source_refs": ["string"],
  "updated_at": "ISO"
}
```

Required initial contours:
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1
- feature/processmap-agent-rag-source-registry-and-index-policy-v1
- feature/processmap-agent-rag-bm25-manifest-search-v1
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1
- fix/diagram-real-drag-performance-and-engine-decomposition-v1
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- fix/diagram-visible-version-and-large-canvas-lag-v1

**Critical distinction:** `formal_verdict` is NOT `user_visible_verdict`. Some Diagram contours have REVIEW_PASS but user still saw lag. Facts must preserve both.

### D. user_rejection_fact

```json
{
  "id": "string",
  "type": "user_rejection_fact",
  "contour_id": "string",
  "rejected_verdict": "REVIEW_PASS | CHANGES_REQUESTED",
  "reason": "string",
  "user_observation": "string",
  "required_next_action": "string",
  "source_refs": ["string"],
  "severity": "critical | high | medium | low",
  "status": "active | superseded | rejected | draft | deprecated",
  "updated_at": "ISO"
}
```

Required initial rejections:
- Previous Diagram REVIEW_PASS where user still saw drag lag.
- REVIEW_PASS that tested wrong scenario (synthetic zoom instead of real drag).
- REVIEW_PASS where version marker was on canvas (later relocated).
- Any contour where “formal pass” did not mean “user-visible solved”.

### E. decision_fact

```json
{
  "id": "string",
  "type": "decision_fact",
  "decision": "string",
  "rationale": "string",
  "applies_to": "string",
  "forbidden_alternatives": ["string"],
  "source_refs": ["string"],
  "status": "active | superseded | rejected | draft | deprecated",
  "updated_at": "ISO"
}
```

Required initial decisions:
- RAG is read-only suggestion/context layer.
- RAG must not auto-mutate.
- RAG must not write BPMN XML.
- AI drafts are not source truth.
- Product Actions durable truth is interview.analysis.product_actions[].
- Product Actions must not write into BPMN XML.
- Version marker must not overlay BPMN canvas.
- Version/update row should increment visibly.
- Large god files require decomposition-first before adding new logic.
- For TO-BE format, follow only user-provided document; no invented terms unless marked hypothesis.

### F. validation_fact

```json
{
  "id": "string",
  "type": "validation_fact",
  "query": "string",
  "expected_terms": ["string"],
  "expected_sources": ["string"],
  "current_result": "string",
  "pass_fail": "PASS | FAIL | PARTIAL",
  "last_run": "ISO",
  "source_refs": ["string"],
  "updated_at": "ISO"
}
```

Required initial validations:
- 7 RAG validation queries from architecture contour.
- Current pass rate: 7/7 PASS (coverage hardening).
- Previous state: BM25 initial validation 3/7.
- Balanced manifest: 1,803 files, all 8 sources represented.

### G. bottleneck_fact

```json
{
  "id": "string",
  "type": "bottleneck_fact",
  "area": "string",
  "problem": "string",
  "current_hypothesis": "string",
  "rejected_hypotheses": ["string"],
  "evidence": "string",
  "next_contour": "string",
  "source_refs": ["string"],
  "status": "active | superseded | rejected | draft | deprecated",
  "updated_at": "ISO"
}
```

Required initial bottlenecks:
- Diagram drag lag remained after drag-hot-path contour; next: perf/process-stage-baseline-jank-v1 unless superseded.
- React bundle ~95% CPU vs bpmn-js ~0.5% from profiler evidence.
- RAG retrieval quality now 7/7 after coverage hardening.
- Next RAG step: feature/processmap-agent-rag-agent-preflight-integration-v1.

---

## Initial Facts Plan

Agent 2 will produce these data files:

```
tools/rag/facts/
  processmap-facts.schema.json      — JSON Schema for all fact types
  processmap-runtime-facts.json     — runtime_fact array
  processmap-agent-rules.json       — agent_rule array
  processmap-contour-facts.ndjson   — contour_fact lines
  processmap-user-rejections.ndjson — user_rejection_fact lines
  processmap-decisions.ndjson       — decision_fact lines
  processmap-validation-facts.json  — validation_fact array
  processmap-bottleneck-facts.ndjson — bottleneck_fact lines
```

Rationale for mixed JSON/NDJSON:
- JSON arrays for small, stable sets (runtime, rules, validation).
- NDJSON for larger or append-oriented sets (contours, rejections, decisions, bottlenecks).
- Both are line-oriented and easy to grep/append without rewriting entire files.

---

## Facts Validator Plan

Tool: `tools/rag/pm-rag-validate-facts.mjs`

Validation checks (18):
1. All fact files parse (JSON or NDJSON).
2. Every fact has `id`, `type`, `status`, `source_refs`, `updated_at`.
3. IDs are unique across all files.
4. `type` is in allowed set.
5. `source_refs` point to existing local files where possible.
6. `status` is in allowed set.
7. `confidence`/`severity` use allowed values if present.
8. `user_rejection_fact` must reference `contour_id`.
9. `contour_fact` must include `formal_verdict` and `user_visible_verdict`.
10. `agent_rule` must include `role` and `required_action` or `forbidden_action`.
11. `decision_fact` must include `rationale`.
12. `validation_fact` must include `pass_fail` and expected source/terms.
13. No `source_ref` points to excluded secrets path.
14. No fact value contains secret-like content.
15. Draft/proposed facts are not treated as truth (warn if draft used as active context).
16. `REVIEW_PASS` can coexist with `user_visible_verdict=not_solved`.
17. User rejection overrides formal pass for agent context.
18. Current RAG coverage hardening fact must record 7/7 PASS.

Output:
- Exit 0 if all checks pass.
- Exit 1 if any check fails.
- JSON + Markdown report.

---

## Facts Lookup/Search Plan

Tool: `tools/rag/pm-rag-search-facts.mjs`

Features:
- Lexical match over `id`, `type`, `key`, `rule`, `decision`, `problem`, `reason`, `query`, `area`.
- `--type` filter.
- `--status` filter.
- `--top-k N`.
- `--json` output.
- Ranked results with `why_matched` array.
- No LLM, no embeddings, no vector DB.

Example commands:
```bash
node tools/rag/pm-rag-search-facts.mjs "Diagram REVIEW_PASS rules"
node tools/rag/pm-rag-search-facts.mjs "current ProcessMap test runtime" --json
node tools/rag/pm-rag-search-facts.mjs "contours where user rejected REVIEW_PASS" --type user_rejection_fact
node tools/rag/pm-rag-search-facts.mjs "React bundle 95 CPU drag bottleneck" --top-k 10
node tools/rag/pm-rag-search-facts.mjs "RAG validation 7 of 7 coverage hardening" --top-k 10
```

Output fields:
- rank, fact_id, type, summary, source_refs, status, confidence/severity, why_matched.

---

## Facts-to-RAG Bridge Plan

Tool or documented workflow: `tools/rag/pm-rag-facts-to-context.mjs`

Purpose:
Compose a deterministic preflight context block from facts, then append supporting BM25 document snippets.

Workflow:
```
1. Query structured facts → get deterministic facts.
2. Extract source_refs from matched facts.
3. Run BM25 search for supporting documents.
4. Compose:
   ## Structured Facts (from registry)
   - hard rules
   - current runtime
   - user rejections
   - latest contour facts
   - current bottleneck
   - required next contour
   ## Supporting Documents (from BM25)
   - related reports
   - paths and snippets
```

If full bridge is too much for this contour:
- Implement static prototype with `--role` and `--query` flags.
- Document full integration as next contour: `feature/processmap-agent-rag-agent-preflight-integration-v1`.

Required examples to support:
1. Planner: "Plan next Diagram lag contour" → bottleneck + rejections + rules + suggested contour.
2. Reviewer: "Review Diagram performance contour" → GSD rule + fresh runtime + real drag + rejection history.
3. Policy: "What is forbidden for RAG?" → no secrets, no auto-mutation, no BPMN writes.
4. Status: "Is BM25 ready for agent preflight?" → 7/7 PASS, 1,803 files, 8 sources, next step.

---

## Secrets / Safety Plan

- Reuse existing `tools/rag/pm-rag-scan-secrets.mjs` on facts registry.
- Facts must NOT contain `.env`, keys, tokens, passwords, connection strings.
- Facts must NOT reference excluded paths (`.env*`, `node_modules`, `dist`, `.git`, etc.).
- `source_refs` should point to curated safe sources only.
- No secrets printed in any report or CLI output.
- Validator check #14 scans fact values for secret-like patterns.

---

## Project Atlas Update Plan

Mirror to:
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Structured Facts Registry.md`
  - Overview, schema, file layout, usage.
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Rules Facts.md`
  - Agent 1/2/3 rules, severity, source refs.
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Contour Facts Index.md`
  - Contour fact table with formal vs user-visible verdicts.
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Facts Validation Results.md`
  - Validator results, pass/fail, known issues.

---

## Acceptance Criteria

Agent 3 should pass only if:

1. Facts schema exists.
2. Initial facts registry exists (all 7 types).
3. Runtime facts include clearvestnic.ru / 5180 / 8088 / /opt/processmap-test.
4. Agent rules exist (Agent 1 GSD, Agent 3 GSD + fresh runtime + exact scenario + real drag).
5. Contour facts exist (including 9 contours listed above).
6. User rejection facts exist and override formal REVIEW_PASS in context.
7. Decision facts exist (including RAG read-only boundary).
8. Validation facts exist (7/7 PASS, 1,803 files, 8 sources).
9. Bottleneck facts exist (drag lag, React 95%, next contour).
10. Facts validator exists and passes all 18 checks.
11. Facts lookup/search CLI exists and returns ranked results for example queries.
12. Facts-to-RAG bridge is documented or minimally implemented.
13. No secrets are included or printed.
14. No excluded paths referenced as source truth.
15. No product runtime changes.
16. No backend/frontend UI changes.
17. No package install.
18. No embeddings/vector DB.
19. Project Atlas RAG docs updated.
20. Tooling commands are repeatable.

No REVIEW_PASS if:
- Facts are generic (no specific contour refs).
- Facts are not linked to source_refs.
- User rejections are missing.
- Formal REVIEW_PASS treated as final truth despite user rejection.
- Current RAG 7/7 status missing.
- Facts contain secrets.
- Product runtime changed.

---

## Non-goals

- No full RAG server/API.
- No mandatory Agent 1/2/3 integration yet (that is next contour).
- No embeddings, no vector database.
- No external services.
- No package installation.
- No product runtime UI changes.
- No backend API changes.
- No auto-mutation.
- No BPMN XML mutation.
- No Product Actions auto-apply.
- No indexing secrets.
- No treating AI drafts as truth.
- No automatic extraction of all facts from all docs as accepted truth.
- No MCP repair.
- No stage/prod deploy.
- No PR/merge/push.

---

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Read previous RAG architecture/registry/BM25/coverage-hardening reports.
3. Confirm source/runtime truth.
4. Implement `processmap-facts.schema.json`.
5. Implement 7 initial fact data files.
6. Implement `pm-rag-validate-facts.mjs`.
7. Run validator; fix any issues.
8. Implement `pm-rag-search-facts.mjs`.
9. Run all example queries; capture outputs.
10. Implement or document `pm-rag-facts-to-context.mjs`.
11. Re-run secrets scan on facts directory.
12. Create all contour reports.
13. Update Project Atlas RAG docs.
14. Write EXEC_REPORT.md.
15. Write READY_FOR_REVIEW.

If blocked at any step, write EXEC_BLOCKED.md and stop.

---

## Agent 3 Review Plan

1. Run Reviewer GSD Discipline (mandatory section).
2. Read all Agent 2 reports.
3. Inspect changed files (should be only under `tools/rag/`, `docs/rag/`, `.planning/contours/<CID>/`, Project Atlas).
4. Run facts validation independently.
5. Run 6+ example searches independently.
6. Verify user rejection facts override formal pass.
7. Verify source_refs exist.
8. Verify no excluded/secrets paths referenced.
9. Verify no secret values printed.
10. Verify no product runtime files changed.
11. Verify no embeddings/vector DB/package install.
12. Create REVIEW_REPORT.md and REVIEW_PASS if pass.
13. Create CHANGES_REQUESTED + REWORK_REQUEST.md if fail.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Fact curation is manual and may miss contours | Source from previous 4 RAG reports + AGENTS.md + known contours; reviewer checks completeness. |
| Formal REVIEW_PASS vs user-visible verdict confusion | Explicit `user_visible_verdict` field; user_rejection_fact overrides. |
| Facts become stale | `updated_at` + `status` fields; freshness is contour-completion-triggered. |
| Schema too rigid for future fact types | Schema uses `allOf` + `required` per type; new types added as new `type` enum value. |
| Validator false-positives on secret-like strings | Use same fail-closed scanner as registry; manual review expected. |
| Scope creep toward full agent integration | Hard boundary: bridge is static/prototype only; full integration is next contour. |

---

## Gates

- [x] Gate 1 — Agent 1 GSD discipline completed
- [x] Gate 2 — previous RAG contours reviewed
- [x] Gate 3 — source/runtime truth captured
- [x] Gate 4 — structured facts scope defined
- [x] Gate 5 — facts schema plan defined
- [x] Gate 6 — initial facts categories defined
- [x] Gate 7 — facts validator plan defined
- [x] Gate 8 — facts lookup/search plan defined
- [x] Gate 9 — facts-to-RAG bridge plan defined
- [x] Gate 10 — no-secrets/no-mutation boundaries defined
- [x] Gate 11 — no product runtime changes locked
- [x] Gate 12 — Agent 2 executor prompt ready
- [x] Gate 13 — Agent 3 reviewer prompt with GSD ready
- [x] Gate 14 — READY_FOR_EXECUTION marker created
