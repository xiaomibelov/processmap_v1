# REVIEWER_PROMPT — Agent 3 / Reviewer

Contour: `feature/processmap-agent-rag-source-registry-and-index-policy-v1`
Run ID: `20260516T142047Z-97868`
Role: Agent 3 / Reviewer

---

## Reviewer GSD Discipline — Mandatory

Agent 3 must perform GSD checks before review.

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
- Explicitly record fallback in `REVIEW_REPORT.md` under `## Reviewer GSD Discipline`.

---

## Review Checklist

### 1. Source Registry Review
- [ ] `tools/rag/processmap-rag-sources.json` exists and is valid JSON.
- [ ] Contains actual paths (not generics like "some docs").
- [ ] All 8 source roots from PLAN.md are present.
- [ ] Each entry has: `id`, `path`, `category`, `include_globs`, `exclude_globs`, `truth_level`, `indexing_priority`, `owner`.
- [ ] Hard exclusions are present: `.env*`, `*.pem`, `*.key`, `node_modules`, `dist`, `__pycache__`, `.git`, `_Imported`.

### 2. Indexing Policy Review
- [ ] `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` exists.
- [ ] Include rules are concrete.
- [ ] Exclude rules are concrete (globs + regex + specific paths).
- [ ] Secrets scanner rules cover 5 categories.
- [ ] AI drafts policy exists and marks drafts as non-canonical.
- [ ] Deprecated docs policy exists.
- [ ] Raw logs policy exists.
- [ ] Read-only boundary is explicit.

### 3. Secrets Scanner Review
- [ ] `tools/rag/pm-rag-scan-secrets.mjs` exists and is executable.
- [ ] Run it: `node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json`
- [ ] Verify it does NOT print secret values in output.
- [ ] Verify it flags `.env.backup_20260514_095731` or equivalent if reachable.
- [ ] Verify exit code is appropriate (0=clean, 1=found, 2=error).
- [ ] Report contains path + rule_id + severity only.

### 4. Manifest Builder Review
- [ ] `tools/rag/pm-rag-build-manifest.mjs` exists.
- [ ] Run it with `--sample --limit 200`.
- [ ] Verify it produces:
  - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json`
  - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.md`
- [ ] Manifest contains expected safe sources:
  - Project Atlas RAG docs
  - Contour reports (PLAN.md, EXEC_REPORT.md, REVIEW_REPORT.md)
  - Selected code paths (backend/app/rag/*.py, frontend/src/components/AppShell.jsx, etc.)
- [ ] Manifest excludes:
  - `.env` and `.env.*`
  - `*.pem`, `*.key`
  - `node_modules/`
  - `frontend/dist/`
  - `__pycache__/`, `*.pyc`
  - `.git/`
  - `_Imported/`

### 5. Metadata Schema Review
- [ ] `tools/rag/processmap-rag-metadata-schema.json` exists.
- [ ] Contains all 18 fields from architecture.
- [ ] Types and required flags are correct.

### 6. Classifier Rules Review
- [ ] `tools/rag/processmap-rag-classifier-rules.json` exists.
- [ ] Contains 10 classes from architecture.
- [ ] Rule-based heuristics are documented.

### 7. Project Atlas Review
- [ ] `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES.md` exists and is up to date.
- [ ] `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md` exists and is up to date.
- [ ] `/srv/obsidian/project-atlas/ProcessMap/RAG/Metadata Schema.md` exists.
- [ ] `/srv/obsidian/project-atlas/ProcessMap/RAG/Validation Queries.md` exists.

### 8. Product Code Impact Review
- [ ] No frontend runtime files changed (except possibly tooling-only scripts).
- [ ] No backend API files changed.
- [ ] No `package.json`, `requirements.txt`, or lockfile changes.
- [ ] No `.env` files modified.

### 9. Validation Commands Review
- [ ] `node tools/rag/pm-rag-validate-policy.mjs` runs and passes.
- [ ] All validation commands from PLAN.md were executed.
- [ ] Results are documented in `VALIDATION_RESULTS.md`.

---

## Independent Validation

Agent 3 must run these commands independently (do not trust Agent 2 output alone):

```bash
cd /opt/processmap-test

# Registry schema check
node -e "const r=require('./tools/rag/processmap-rag-sources.json'); console.log('sources:', r.sources?.length || r.length);"

# Secrets scanner
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json

# Manifest build
node tools/rag/pm-rag-build-manifest.mjs --sample --limit 200

# Verify exclusions in manifest
grep -i '"path".*\.env' .planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .env"
grep -i '"path".*node_modules' .planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no node_modules"
grep -i '"path".*dist/' .planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no dist"

# Check changed files
git diff --name-only
git status -sb
```

---

## Review Report Requirements

Create `REVIEW_REPORT.md` with:

1. `## Reviewer GSD Discipline`
   - GSD mode used
   - Commands run
   - Source/runtime truth at review time

2. `## Checklist Results`
   - Per-section pass/fail with evidence

3. `## Fail Condition Verification`
   - Table of fail conditions from acceptance criteria and whether triggered

4. `## Independent Validation Results`
   - Exact commands run
   - Output summaries
   - Pass/fail per command

5. `## Verdict`
   - `REVIEW_PASS` or `CHANGES_REQUESTED`
   - Reasoning

If pass: create `REVIEW_PASS` empty marker file.
If fail: create `CHANGES_REQUESTED` and `REWORK_REQUEST.md` with specific actionable items.

---

## Reviewer Hard Rules

- Do not modify product runtime files during review.
- Do not commit, push, or deploy.
- Do not print secrets.
- Verify scanner output manually if uncertain.
- Be conservative: if a secret might be exposed, flag it.
