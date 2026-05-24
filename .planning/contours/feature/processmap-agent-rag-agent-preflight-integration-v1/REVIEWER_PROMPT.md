# REVIEWER_PROMPT — Agent 3 / Reviewer

**Contour:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Run ID:** `20260516T164830Z-8575`

---

## 0. Reviewer GSD Discipline — Mandatory

Before any verdict, run:
```bash
cd /opt/processmap-test
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```

If GSD available:
- Use GSD review/check discipline.

If GSD unavailable:
- Continue as `GSD_FALLBACK_MANUAL_REVIEW_ONLY`.
- Explicitly record fallback mode in `REVIEW_REPORT.md` under "Reviewer GSD Discipline".

Record all in `REVIEW_REPORT.md` under "Reviewer GSD Discipline":
- GSD mode
- Commands run
- Source/runtime truth
- Independent validation commands
- Preflight integration tests
- Pass/fail reasoning

**No REVIEW_PASS if:**
- Reviewer GSD section missing
- Preflight command missing
- Facts-first behavior missing
- BM25 supporting docs missing
- Agent 1/2/3 usage examples missing
- User rejection override not represented
- Product runtime changed without scope
- Secrets policy weakened

---

## 1. Read First

1. `PLAN.md` (this contour)
2. `EXECUTOR_PROMPT.md` (this contour)
3. `EXEC_REPORT.md` (Agent 2 output)
4. All other Agent 2 reports in this contour folder
5. Previous RAG contour reports (for context):
   - `.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/REVIEW_REPORT.md`
   - `.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md`

---

## 2. Independent Validation Commands

Run each command independently and record output.

### 2.1 Facts Validator
```bash
node tools/rag/pm-rag-validate-facts.mjs
```
**Expect:** 28/28 PASS (or document any change).

### 2.2 BM25 Validation
```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
**Expect:** 7/7 PASS (or document if runner changed).

### 2.3 Secrets Scan
```bash
node tools/rag/pm-rag-scan-secrets.mjs --registry tools/rag/processmap-rag-sources.json
```
**Expect:** Clean or false positives documented. No secret values printed.

### 2.4 Preflight CLI — Planner Mode
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "perf/process-stage-baseline-jank-v1" \
  --area "Diagram performance lag" \
  --format md
```
**Verify:**
- [ ] Output contains structured facts section
- [ ] Runtime facts present (clearvestnic.ru, 5180, 8088, /opt/processmap-test)
- [ ] Agent rules present (Agent 1 GSD discipline)
- [ ] User rejection override visible (e.g., `ur-perf-drag-hot-path`)
- [ ] Bottleneck facts present (React 95% CPU)
- [ ] Supporting documents present with rank, score, snippet, why_matched
- [ ] Required gates present for planner
- [ ] Warnings present

### 2.5 Preflight CLI — Reviewer Mode
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "perf/process-stage-baseline-jank-v1" \
  --query "Diagram performance review rules" \
  --format json
```
**Verify:**
- [ ] Valid JSON output
- [ ] Agent 3 GSD rules present
- [ ] Fresh 5180 runtime proof referenced
- [ ] Real user scenario referenced
- [ ] User rejection facts present with severity
- [ ] Verdict implications section present

### 2.6 Preflight CLI — Policy Query
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "What is forbidden for RAG?" \
  --format md
```
**Verify:**
- [ ] No auto-mutation rule present
- [ ] No BPMN XML write rule present
- [ ] No secrets rule present
- [ ] No AI drafts as truth rule present
- [ ] Supporting policy docs referenced

### 2.7 Preflight CLI — Runtime Query
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --query "current ProcessMap test runtime" \
  --format md
```
**Verify:**
- [ ] clearvestnic.ru present
- [ ] /opt/processmap-test present
- [ ] 5180 present
- [ ] 8088 present
- [ ] Project Atlas path present

---

## 3. File Inspection Checklist

Inspect each changed or created file:

| # | Path | Expected | Check |
|---|------|----------|-------|
| 1 | `tools/rag/pm-rag-agent-preflight.mjs` | Exists, handles all args, no secrets, no mutation | Verify |
| 2 | `tools/rag/AGENT_RAG_PREFLIGHT_TEMPLATE.md` | Exists, documents all 3 roles, includes gates | Verify |
| 3 | `PREFLIGHT_PLANNER_SAMPLE.md` / `.json` | Exists, non-empty, shows facts-first + BM25-second | Verify |
| 4 | `PREFLIGHT_EXECUTOR_SAMPLE.md` / `.json` | Exists, non-empty, policy/runtime visible | Verify |
| 5 | `PREFLIGHT_REVIEWER_SAMPLE.md` / `.json` | Exists, non-empty, rejection override visible | Verify |
| 6 | `tools/pm-agent1-planner.sh` | Either modified safely OR unchanged with deferred rationale | Verify |
| 7 | `tools/pm-agent2-executor-watch.sh` | Either modified safely OR unchanged with deferred rationale | Verify |
| 8 | `tools/pm-agent3-reviewer-watch.sh` | Either modified safely OR unchanged with deferred rationale | Verify |
| 9 | Project Atlas RAG docs | 3 files updated/created | Verify |
| 10 | No changes to `frontend/src/`, `backend/app/`, `.env`, `package.json` | Zero product runtime changes | Verify |

---

## 4. Acceptance Criteria Verification

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Agent preflight CLI exists | Check `tools/rag/pm-rag-agent-preflight.mjs` |
| 2 | Preflight uses structured facts first | Run planner mode; verify facts appear before BM25 docs |
| 3 | Preflight uses BM25 supporting documents second | Run any mode; verify `Supporting Documents` section present |
| 4 | Planner mode works | Run §2.4; inspect output |
| 5 | Executor mode works | Run §2.6; inspect output |
| 6 | Reviewer mode works | Run §2.5; inspect output |
| 7 | Markdown output works | Run §2.4; verify markdown structure |
| 8 | JSON output works | Run §2.5; verify valid JSON |
| 9 | Preflight includes runtime facts | Run §2.7; check for clearvestnic.ru, 5180, 8088 |
| 10 | Preflight includes agent rules | Run §2.4; check for Agent 1/2/3 rules |
| 11 | Preflight includes user rejections | Run §2.4; check for rejection facts |
| 12 | Preflight includes contour facts | Run §2.4 with `--contour`; check contour facts |
| 13 | Preflight includes decisions | Run §2.6; check for decision facts |
| 14 | Preflight includes bottlenecks | Run §2.4; check for bottleneck facts |
| 15 | Preflight includes supporting document snippets | Run any mode; check for `snippet` with `*term*` |
| 16 | User rejection override is visible | Run reviewer mode; verify rejections labeled as overriding formal pass |
| 17 | RAG read-only/no-mutation rules visible | Run §2.6; verify no-auto-mutate, no-BPMN-write |
| 18 | Current ProcessMap runtime facts visible | Run §2.7; verify server/ports/paths |
| 19 | Agent 3 review context includes GSD + fresh runtime + exact user scenario gates | Run reviewer mode; verify gates section |
| 20 | Existing facts validator still passes | Run §2.1 |
| 21 | Existing BM25 validation still passes | Run §2.2 |
| 22 | Secrets scan clean or false positives documented | Run §2.3 |
| 23 | No secret values printed | Grep outputs for `sk-`, `eyJ`, `bearer`, passwords |
| 24 | No product runtime changes | `git diff --name-only` must not show new product files |
| 25 | No backend/frontend UI changes | No changes to `frontend/src/` or `backend/app/` |
| 26 | No package install | No `package.json`, `requirements.txt`, lockfile changes |
| 27 | No embeddings/vector DB | No new `node_modules`, no vector DB processes |
| 28 | Project Atlas RAG docs updated | Check 3 files in `/srv/obsidian/project-atlas/ProcessMap/RAG/` |
| 29 | Agent 1/2/3 report templates/contracts documented | Check `AGENT_RAG_PREFLIGHT_TEMPLATE.md` |
| 30 | Commands are repeatable | Run each command twice; compare outputs |

---

## 5. Verdict

### If PASS

Create:
- `REVIEW_REPORT.md` (with all sections above)
- `REVIEW_PASS` (empty marker file)

Then run:
```bash
./tools/pm-agent-mirror-report.sh "feature/processmap-agent-rag-agent-preflight-integration-v1" reviewer
```

### If FAIL

Create:
- `REVIEW_REPORT.md` (with all sections above)
- `CHANGES_REQUESTED` (empty marker file)
- `REWORK_REQUEST.md` (precise, actionable items)

Then run:
```bash
./tools/pm-agent-mirror-report.sh "feature/processmap-agent-rag-agent-preflight-integration-v1" reviewer
```

### If BLOCKED

Create:
- `REVIEW_BLOCKED.md` (reason)
