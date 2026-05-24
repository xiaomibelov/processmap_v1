# REVIEWER_PROMPT — Agent 3 / Reviewer

Contour: `feature/processmap-agent-rag-structured-facts-registry-v1`
Run ID: `20260516T162132Z-6414`

---

## Reviewer GSD Discipline — Mandatory

Agent 3 must execute before reviewing:

```bash
cd /opt/processmap-test

echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

If GSD is available:
- Use GSD review/check discipline.

If GSD is unavailable:
- Continue as `GSD_FALLBACK_MANUAL_REVIEW_ONLY`.
- Explicitly record fallback in `REVIEW_REPORT.md`.

`REVIEW_REPORT.md` must contain:

## Reviewer GSD Discipline
- GSD mode
- Commands run
- Source/runtime truth
- Facts validation commands
- Facts lookup tests
- No-secrets verification
- Pass/fail reasoning

---

## Source / Runtime Truth Capture

Before reviewing, record:

```bash
cd /opt/processmap-test
pwd && whoami && hostname && date -Is
git status -sb && git branch --show-current
git rev-parse HEAD && git rev-parse origin/main
git diff --name-only && git diff --stat
curl -s http://clearvestnic.ru:8088/health || true
curl -I http://clearvestnic.ru:5180 || true
```

---

## Review Steps

### Step 1 — Read Agent 2 Reports

Read all of these in the contour folder:
- `EXEC_REPORT.md`
- `FACTS_SCHEMA_REPORT.md`
- `FACTS_REGISTRY_REPORT.md`
- `FACTS_VALIDATION_REPORT.md`
- `FACTS_LOOKUP_REPORT.md`
- `FACTS_TO_RAG_BRIDGE_REPORT.md`
- `SECRETS_AND_SAFETY_REPORT.md`
- `RUNTIME_BEHAVIOR_IMPACT.md`
- `IMPLEMENTATION_NOTES.md`

### Step 2 — Inspect Changed Files

Verify only these areas were changed:
- `tools/rag/facts/`
- `tools/rag/*.mjs` (new validator/search/bridge scripts)
- `docs/rag/` (if any)
- `.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/`

No changes to:
- `frontend/src/` product code
- `backend/app/` product code
- `.env`
- `package.json`, `requirements.txt`, lockfiles

### Step 3 — Run Facts Validation Independently

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-validate-facts.mjs
```

Must exit 0. Read `FACTS_VALIDATION_REPORT.md` and confirm it matches your run.

### Step 4 — Run Facts Searches Independently

Run at least these queries and verify specific facts are returned:

```bash
node tools/rag/pm-rag-search-facts.mjs "Diagram REVIEW_PASS rules"
node tools/rag/pm-rag-search-facts.mjs "current ProcessMap test runtime" --json
node tools/rag/pm-rag-search-facts.mjs "contours where user rejected REVIEW_PASS" --type user_rejection_fact
node tools/rag/pm-rag-search-facts.mjs "React bundle 95 CPU drag bottleneck" --top-k 10
node tools/rag/pm-rag-search-facts.mjs "What is forbidden for RAG?"
node tools/rag/pm-rag-search-facts.mjs "RAG validation 7 of 7 coverage hardening" --top-k 10
```

For each query, verify:
- Results are ranked.
- Each result has fact_id, type, summary, source_refs, status.
- Results are specific (reference actual contour IDs, not generic text).
- `why_matched` is present.

### Step 5 — Verify User Rejection Facts Override Formal Pass

Check:
- `user_rejection_fact` entries exist for Diagram contours.
- Those entries reference `contour_id`.
- `contour_fact` for the same contour has `formal_verdict: REVIEW_PASS` but `user_visible_verdict: not_solved` or `user_accepted: false`.
- Agent 2 documentation or bridge output explains that user rejection takes precedence over formal pass in agent context.

### Step 6 — Verify Source Refs Exist

For a sample of facts (at least 10), check that `source_refs` point to files that exist:

```bash
cd /opt/processmap-test
# Example spot-check
ls -la <source_ref_path>
```

### Step 7 — Verify No Excluded / Secrets Paths Referenced

Check that no `source_ref` contains:
- `.env`
- `node_modules`
- `dist/`
- `__pycache__`
- `.pem`, `.key`, `id_rsa`
- `.playwright-mcp/`
- `.agents/`

Also run:
```bash
node tools/rag/pm-rag-scan-secrets.mjs --path tools/rag/facts/ || true
```

### Step 8 — Verify No Secret Values Printed

Review:
- All report files for secret-like strings.
- Search CLI output samples.
- Validation report output.

No `sk-`, JWT, bearer tokens, connection strings, passwords should appear.

### Step 9 — Verify No Product Runtime Changes

```bash
cd /opt/processmap-test
git diff --name-only
```

Only pre-existing 8 frontend files should appear. No new product code changes.

### Step 10 — Verify No Embeddings / Vector DB / Package Install

```bash
# Check for new node_modules or pip installs
ls tools/rag/node_modules 2>/dev/null || echo "PASS: no node_modules"
# Check for vector DB processes
ps aux | grep -E "milvus|pinecone|chroma|qdrant|weaviate|pgvector" || echo "PASS: no vector DB"
# Check package.json changes
git diff --name-only | grep -E "package\.json|requirements\.txt|package-lock|yarn.lock" || echo "PASS: no package changes"
```

### Step 11 — Verify Project Atlas Updates

Check that these files exist and are non-empty:
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Structured Facts Registry.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Rules Facts.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Contour Facts Index.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Facts Validation Results.md`

---

## Acceptance Criteria Checklist

Agent 3 must score each item:

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Facts schema exists | | |
| 2 | Initial facts registry exists (all 7 types) | | |
| 3 | Runtime facts include clearvestnic.ru / 5180 / 8088 / /opt/processmap-test | | |
| 4 | Agent rules exist | | |
| 5 | Contour facts exist | | |
| 6 | User rejection facts exist | | |
| 7 | Decision facts exist | | |
| 8 | Validation facts exist | | |
| 9 | Bottleneck facts exist | | |
| 10 | Facts validator exists and passes | | |
| 11 | Facts lookup/search CLI exists | | |
| 12 | Facts query examples return specific facts | | |
| 13 | User rejection facts override formal REVIEW_PASS in context | | |
| 14 | RAG read-only boundary encoded as decision/rule facts | | |
| 15 | Runtime facts include server/ports/paths | | |
| 16 | Agent 3 review rules include GSD + fresh runtime + exact scenario | | |
| 17 | Validation facts include current 7/7 RAG coverage hardening | | |
| 18 | No secrets included or printed | | |
| 19 | No excluded paths referenced as source truth | | |
| 20 | No product runtime changes | | |
| 21 | No backend/frontend UI changes | | |
| 22 | No package install | | |
| 23 | No embeddings/vector DB | | |
| 24 | Project Atlas RAG docs updated | | |
| 25 | Tooling commands are repeatable | | |
| 26 | Facts-to-RAG bridge documented or minimally implemented | | |

---

## Verdict Rules

**REVIEW_PASS** only if:
- All 26 criteria are PASS or N/A.
- Reviewer GSD Discipline section is present in REVIEW_REPORT.md.
- No product runtime changes.
- No secrets.
- No package install.
- No embeddings/vector DB.

**CHANGES_REQUESTED** if any of the following:
- Facts schema missing or invalid.
- Facts validator missing or failing.
- Facts not linked to source documents.
- User rejection facts missing.
- Agent rules missing.
- Runtime facts missing.
- Current RAG 7/7 validation state not represented.
- Secrets policy weakened.
- Product runtime changed without scope.
- Formal REVIEW_PASS treated as final truth despite user rejection.

If CHANGES_REQUESTED, create `REWORK_REQUEST.md` with:
- Specific defects.
- Required fixes.
- Re-review trigger conditions.

---

## Final Deliverables

Create in contour folder:
- `REVIEW_REPORT.md` (with GSD discipline, checklist, verdict)
- `REVIEW_PASS` or `CHANGES_REQUESTED`
- `REWORK_REQUEST.md` (if CHANGES_REQUESTED)
