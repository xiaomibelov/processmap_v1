# MANIFEST_BUILD_REPORT

**Contour:** `feature/processmap-agent-rag-source-registry-and-index-policy-v1`  
**Run ID:** `20260516T142047Z-97868`  
**Builder:** `tools/rag/pm-rag-build-manifest.mjs` v1.0.0

---

## Build Parameters

| Parameter | Value |
|-----------|-------|
| Registry | `tools/rag/processmap-rag-sources.json` |
| Classifier | `tools/rag/processmap-rag-classifier-rules.json` |
| Sample mode | `--sample` |
| Limit | `--limit 200` |

## Output Files

| File | Path |
|------|------|
| JSON manifest | `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json` |
| Markdown manifest | `.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.md` |

## Manifest Statistics

| Metric | Value |
|--------|-------|
| Total files | 200 |
| Registry version | 1.0.0 |
| Generated | 2026-05-16T14:38:52Z |
| Sample mode | true |

## Files by Source

| Source ID | Count | Notes |
|-----------|-------|-------|
| project-atlas | 200 | Sample cap reached before other sources |

> Note: With `--limit 200`, the manifest builder processed sources in registry order. Project Atlas (727 files) filled the entire cap. In a full (non-sample) run, all 8 sources would be represented.

## Files by Class

| Class | Count | Description |
|-------|-------|-------------|
| draft | 95 | WIP notes, unreviewed suggestions |
| evidence | 55 | Runtime proof, screenshots, profiles |
| prompt_template | 43 | Agent prompts, checklists, skill bindings |
| source_truth | 3 | ADR, contracts, canonical API docs |
| code_map | 2 | Export/import maps, module summaries |
| audit | 1 | Performance audits, security audits |
| decision | 1 | ADR, review verdicts, go/no-go decisions |
| backlog | 0 | Prioritized work items |
| deprecated | 0 | Outdated docs |
| raw_log | 0 | Summarized only; never raw bulk |

## Files by Category

| Category | Count |
|----------|-------|
| project_atlas | 200 |

## Metadata Fields Present

All 18 fields are populated per the metadata schema:

- `chunk_id` ✅
- `path` ✅
- `title` ✅
- `project` ✅ (always "ProcessMap")
- `category` ✅
- `date` ✅ (file birthtime)
- `mtime` ✅ (file mtime)
- `source_type` ✅ (inferred from extension)
- `truth_level` ✅ (from registry)
- `tags` ✅
- `excluded_sensitive` ✅ (always false)
- `excluded_sensitive_proof` ✅ (scanner evidence object)
- `class` ✅ (from classifier)
- `source_id` ✅
- `sha256` ✅ (computed via crypto.createHash)
- `size_bytes` ✅
- `lines` ✅
- `language` / `module` ✅ (for code files where applicable)

## Sensitive Path Exclusion Verification

| Pattern | Found in Manifest? | Result |
|---------|-------------------|--------|
| `.env` | No | ✅ PASS |
| `.pem` | No | ✅ PASS |
| `node_modules` | No | ✅ PASS |
| `frontend/dist` | No | ✅ PASS |
| `__pycache__` | No | ✅ PASS |
| `.git` | No | ✅ PASS |
| `.agents` | No | ✅ PASS |
| `.playwright-mcp` | No | ✅ PASS |

## SHA256 Coverage

All 200 manifest entries include a SHA256 hash of file content. No collisions detected in sample.

## Known Limitations

- Sample mode caps at first 200 files across all sources. A full run would process all sources.
- Classifier is rule-based (path patterns + extensions) with no embeddings. Edge cases may need manual review.
- `risk_area` and `lines_start`/`lines_end` are not populated at file level; intended for chunk-level metadata in Contour 3.
