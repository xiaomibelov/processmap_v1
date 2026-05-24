# EXECUTOR_PROMPT — Agent 2 / Executor

Contour: `feature/processmap-agent-rag-source-registry-and-index-policy-v1`
Run ID: `20260516T142047Z-97868`
Role: Agent 2 / Executor

---

## Pre-Flight Checklist

Before writing any code, Agent 2 must:

1. Read:
   - `PLAN.md` (this contour)
   - `RUNTIME_NAVIGATION.md`
   - `RUNTIME_PROOF_CHECKLIST.md`
   - `STATE.json`
   - Previous architecture contour reports:
     - `.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RAG_ARCHITECTURE.md`
     - `.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/INDEXING_POLICY.md`
     - `.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/SOURCE_INVENTORY.md`

2. Confirm source/runtime truth:
   ```bash
   cd /opt/processmap-test
   pwd
   git branch --show-current
   git rev-parse HEAD
   git status -sb
   ```

3. Verify you are on the expected branch and workspace. If branch is unexpected, document it in EXEC_REPORT.md but do NOT block unless product code changes would conflict.

---

## Implementation Tasks

Implement the following files. Use Node.js built-ins where possible. No package installation.

### A. Source Registry
**File**: `tools/rag/processmap-rag-sources.json`

Must include actual source roots with concrete paths:
- `/srv/obsidian/project-atlas/ProcessMap`
- `/opt/processmap-test/.planning/contours`
- `/opt/processmap-test/docs`
- `/opt/processmap-test/PROCESSMAP/HANDOFF`
- `/opt/processmap-test/frontend/src`
- `/opt/processmap-test/backend`
- `/opt/processmap-test/tools`
- `/opt/processmap-test/scripts`

Per entry: `id`, `path`, `category`, `include_globs`, `exclude_globs`, `truth_level`, `indexing_priority`, `owner`, `notes`.

Global `exclude_globs` must cover:
- `**/.env*`, `**/*.pem`, `**/*.key`, `**/id_rsa`, `**/id_ed25519`
- `**/node_modules/**`, `**/frontend/dist/**`, `**/__pycache__/**`, `**/*.pyc`
- `**/.git/**`, `**/.playwright-mcp/**`, `**/.agents/**`, `**/*.backup*`
- `/srv/obsidian/project-atlas/ProcessMap/_Imported/**`
- `**/debug-*.mjs`, `**/run-*.mjs`

### B. Indexing Policy
**File**: `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md`

Sections:
1. Include rules
2. Exclude rules (globs + regex + specific paths)
3. Secrets scanner rules (5 categories, fail-closed behavior)
4. AI drafts policy
5. Deprecated docs policy
6. Raw logs policy
7. Screenshots/binaries policy
8. Update workflow
9. Read-only boundary (allowed/forbidden table)

### C. Metadata Schema
**File**: `tools/rag/processmap-rag-metadata-schema.json`

Implement 18-field schema from architecture. Define types, required arrays, enums.

### D. Document Classifier Rules
**File**: `tools/rag/processmap-rag-classifier-rules.json`

10 classes: `source_truth`, `evidence`, `decision`, `prompt_template`, `code_map`, `audit`, `backlog`, `draft`, `deprecated`, `raw_log`.
Include rule-based heuristics (path patterns, extensions).

### E. Secrets Scanner
**File**: `tools/rag/pm-rag-scan-secrets.mjs`

Requirements:
- Node built-ins only.
- `--registry <path>` flag.
- Detect path risks: `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `secrets/`, cookies/session storage.
- Detect content patterns without printing values: `token=`, `api_key`, `private key block`, `password=`, `bearer`, JWT-like strings.
- Report: path + rule_id + severity only.
- Exit codes: 0=clean, 1=secrets found, 2=error.
- Never print secret values.

### F. Manifest Builder
**File**: `tools/rag/pm-rag-build-manifest.mjs`

Requirements:
- Read registry.
- Walk directories recursively (built-in `fs.readdir` with `recursive: true` where supported, or custom walker).
- Apply exclude globs.
- Classify files using classifier rules.
- Attach metadata (18 fields, file-level).
- Compute sha256 (`crypto.createHash`).
- Produce:
  - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json`
  - `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.md`
- Support `--sample --limit 200`.
- No embeddings.

### G. Validation Script
**File**: `tools/rag/pm-rag-validate-policy.mjs`

Requirements:
- Validate registry JSON schema (paths exist, required fields present).
- Validate no required include path is missing.
- Validate exclude globs are non-empty.
- Run secrets scan.
- Build sample manifest.
- Exit non-zero on any failure.

---

## Project Atlas Updates

Create or update:
- `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Metadata Schema.md`
- `/srv/obsidian/project-atlas/ProcessMap/RAG/Validation Queries.md`

Content should mirror the tooling files, adapted for human readability in Obsidian.

---

## Validation Commands

Agent 2 must run and capture output:

```bash
cd /opt/processmap-test

node tools/rag/pm-rag-validate-policy.mjs
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
node tools/rag/pm-rag-build-manifest.mjs --sample --limit 200
```

Also verify:
```bash
# Check manifest excludes sensitive paths
grep -E '"path".*\.env' .planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .env in manifest"
grep -E '"path".*node_modules' .planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no node_modules in manifest"
```

---

## Reports to Create

Inside the contour folder, create:
1. `EXEC_REPORT.md` — summary of what was done, files created, validation results.
2. `SOURCE_REGISTRY_REPORT.md` — registry contents summary, source count by category.
3. `INDEXING_POLICY_REPORT.md` — policy coverage summary, exclusions count.
4. `SECRETS_SCAN_REPORT.md` — scanner results, files scanned, findings (no values).
5. `MANIFEST_BUILD_REPORT.md` — manifest stats, files included, classified counts.
6. `VALIDATION_RESULTS.md` — command outputs, pass/fail per check.
7. `IMPLEMENTATION_NOTES.md` — technical notes, deviations from plan, known limitations.
8. `READY_FOR_REVIEW` — empty marker file.

If blocked, create `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

---

## Hard Rules

- **No product runtime changes**: Do not modify frontend/src files that affect UI behavior. Do not modify backend app code that affects API behavior.
- **No package install**: Do not run `npm install`, `pip install`, or equivalent. Use only built-ins.
- **No embeddings/vector DB**: Do not generate embeddings or start a vector database.
- **No secrets printed**: Scanner reports must show path+rule+severity only. Never log secret values.
- **No auto-mutation**: Scripts are read-only. No file writes outside contour and tooling directories.
- **No commit/push/PR**: Do not run git commit, push, or open PRs.
- **No deploy**: Do not deploy to stage or prod.

---

## RAG Boundary (Read-Only)

> The RAG/RAK layer is strictly read-only. It provides context, suggestions, and warnings. It does NOT auto-mutate code, auto-save files, write BPMN XML, apply Product Actions, or override human review verdicts. Any RAG suggestion must be explicitly accepted by the human operator before application.

This contour builds the **registry and policy layer only** — no runtime mutation.
