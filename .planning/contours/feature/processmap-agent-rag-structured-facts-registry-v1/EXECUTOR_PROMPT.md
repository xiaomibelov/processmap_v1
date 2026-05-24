# EXECUTOR_PROMPT — Agent 2 / Executor

Contour: `feature/processmap-agent-rag-structured-facts-registry-v1`
Run ID: `20260516T162132Z-6414`

---

## Pre-execution Checklist

Before writing any code, Agent 2 must:

1. Read:
   - `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/PLAN.md`
   - `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md`
   - `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_PROOF_CHECKLIST.md`
   - `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/STATE.json`

2. Read previous RAG reports (at least skim):
   - `.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/REVIEW_REPORT.md`
   - `.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RAG_ARCHITECTURE.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEW_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/SOURCE_REGISTRY_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEW_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/VALIDATION_QUERY_RESULTS.md`
   - `.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md`
   - `.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/COVERAGE_HARDENING_REPORT.md`

3. Confirm source/runtime truth:
   ```bash
   cd /opt/processmap-test
   pwd && whoami && hostname && date -Is
   git status -sb && git branch --show-current
   git rev-parse HEAD && git rev-parse origin/main
   curl -s http://clearvestnic.ru:8088/health || true
   curl -I http://clearvestnic.ru:5180 || true
   ```

4. Verify GSD availability:
   ```bash
   command -v gsd || true
   command -v gsd-sdk || true
   test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
   test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
   ```

---

## Implementation Tasks

### Task 1 — Facts Schema

Create `tools/rag/facts/processmap-facts.schema.json`:
- JSON Schema Draft 7 compatible.
- Define all 7 fact types: runtime_fact, agent_rule, contour_fact, user_rejection_fact, decision_fact, validation_fact, bottleneck_fact.
- Common required fields: `id`, `type`, `status`, `source_refs`, `updated_at`.
- Allowed enums for `status`, `confidence`, `severity`, `pass_fail`, `formal_verdict`, `user_visible_verdict`.
- Type-specific required fields as documented in PLAN.md.

### Task 2 — Initial Curated Facts

Create these data files under `tools/rag/facts/`:

1. `processmap-runtime-facts.json` — runtime_fact array.
   - clearvestnic.ru, /opt/processmap-test, :5180, :8088/health, Project Atlas paths, contour root.

2. `processmap-agent-rules.json` — agent_rule array.
   - Agent 1 GSD, Agent 3 GSD, fresh 5180, exact scenario, real drag, no PR without command, no product runtime changes in RAG contours, RAG read-only.

3. `processmap-contour-facts.ndjson` — one contour_fact per line.
   - 9 contours minimum (4 RAG + 5 Diagram).
   - Preserve formal_verdict vs user_visible_verdict distinction.
   - Include metrics where known (e.g., 7/7 PASS, 1,803 files).

4. `processmap-user-rejections.ndjson` — user_rejection_fact lines.
   - Diagram contours where formal pass ≠ user-visible solved.
   - Include reason, user_observation, required_next_action.

5. `processmap-decisions.ndjson` — decision_fact lines.
   - RAG read-only, no auto-mutate, no BPMN XML writes, AI drafts not truth, Product Actions truth source, version marker rules, decomposition-first, TO-BE format rules.

6. `processmap-validation-facts.json` — validation_fact array.
   - 7 RAG validation queries.
   - Current 7/7 PASS, previous 3/7, manifest 1,803 files / 8 sources.

7. `processmap-bottleneck-facts.ndjson` — bottleneck_fact lines.
   - Diagram drag lag, React 95% CPU, RAG 7/7 improved, next RAG step preflight integration.

Rules for curation:
- Every fact must have concrete `source_refs` pointing to real files.
- Use absolute paths or repo-relative paths that exist.
- Do NOT invent facts without source evidence.
- Mark uncertain or inferred facts as `status: draft`.

### Task 3 — Facts Validator

Create `tools/rag/pm-rag-validate-facts.mjs`:
- Read all fact files from `tools/rag/facts/`.
- Validate against schema.
- Check 18 validation rules from PLAN.md §8.
- Exit 0 on pass, 1 on failure.
- Write JSON + Markdown reports to contour folder.

Run it and fix any issues before proceeding.

### Task 4 — Facts Lookup / Search CLI

Create `tools/rag/pm-rag-search-facts.mjs`:
- Read all fact files into memory.
- Lexical match over structured fields.
- Support flags: `--type`, `--status`, `--top-k`, `--json`.
- Rank by match frequency + field weight (e.g., id > summary > source_refs).
- Output: rank, fact_id, type, summary, source_refs, status, confidence/severity, why_matched.

Run all example queries and capture outputs:
```bash
node tools/rag/pm-rag-search-facts.mjs "Diagram REVIEW_PASS rules"
node tools/rag/pm-rag-search-facts.mjs "current ProcessMap test runtime" --json
node tools/rag/pm-rag-search-facts.mjs "contours where user rejected REVIEW_PASS" --type user_rejection_fact
node tools/rag/pm-rag-search-facts.mjs "React bundle 95 CPU drag bottleneck" --top-k 10
node tools/rag/pm-rag-search-facts.mjs "RAG validation 7 of 7 coverage hardening" --top-k 10
```

### Task 5 — Facts-to-RAG Bridge

Create `tools/rag/pm-rag-facts-to-context.mjs` (prototype) or document bridge in `FACTS_TO_RAG_BRIDGE_REPORT.md`:
- Accept `--role {planner|executor|reviewer}` and `--query "..."`.
- Query facts registry first.
- Return structured context block.
- If BM25 search CLI is available, optionally append supporting doc snippets.

If implementation is too complex, document the bridge design and concrete examples in the report, and note next contour: `feature/processmap-agent-rag-agent-preflight-integration-v1`.

### Task 6 — Secrets / Safety Recheck

Run:
```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json || true
node tools/rag/pm-rag-scan-secrets.mjs --path tools/rag/facts/ || true
```

Document findings in `SECRETS_AND_SAFETY_REPORT.md`.

### Task 7 — Reports

Create in contour folder:
- `EXEC_REPORT.md` — what was done, what passed, what is left.
- `FACTS_SCHEMA_REPORT.md` — schema summary, types, required fields.
- `FACTS_REGISTRY_REPORT.md` — counts per fact type, coverage, source_refs summary.
- `FACTS_VALIDATION_REPORT.md` — validator results, per-check status.
- `FACTS_LOOKUP_REPORT.md` — query outputs, example results.
- `FACTS_TO_RAG_BRIDGE_REPORT.md` — bridge design, examples, next steps.
- `SECRETS_AND_SAFETY_REPORT.md` — scan results, false positives, policy.
- `RUNTIME_BEHAVIOR_IMPACT.md` — "None; this contour does not touch product runtime."
- `IMPLEMENTATION_NOTES.md` — design decisions, known limitations, next contour proposals.

### Task 8 — Project Atlas Update

Create or update:
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Structured Facts Registry.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Rules Facts.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Contour Facts Index.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Facts Validation Results.md`

### Task 9 — Finalize

Write `READY_FOR_REVIEW` file in contour folder.

If anything is blocked, write `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

---

## Boundaries

**Allowed:**
- Create/modify files under `tools/rag/facts/`, `tools/rag/*.mjs`, `docs/rag/`, `.planning/contours/<CID>/`, `/srv/obsidian/project-atlas/ProcessMap/RAG/`.
- Use Node built-ins only.
- Use existing dependencies if already available and justified.

**Forbidden:**
- Product runtime behavior changes.
- Frontend UI changes.
- Backend API changes.
- Package install (npm, pip, etc.).
- Embeddings / vector DB.
- Auto-mutation of any file based on fact content.
- BPMN XML mutation.
- Product Actions auto-apply.
- Secrets indexing or printing.
- Treating AI drafts as canonical truth.
- Commit / push / PR.
- Deploy stage / prod.
