# AGENT_INTEGRATION_PLAN — ProcessMap Agent RAG / Knowledge Layer

Contour: architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

---

## 1. Agent 1 / Planner RAG Preflight Block

### Before Planning, Query RAG For

1. **Previous contours with same area**
   - Search terms: contour category + keywords from task description
   - Expected sources: `PLAN.md`, `EXEC_REPORT.md` from similar contours
   - Filter: same category (fix/perf/feature/uiux)

2. **Relevant source maps**
   - Search terms: file paths likely to be touched + `SOURCE_MAP`
   - Expected sources: `SOURCE_MAP.md`, code export maps

3. **Architecture decisions (ADR)**
   - Search terms: topic keywords + `ADR` or `Architecture`
   - Expected sources: `Architecture/*.md`, `Decisions/*.md`, `docs/*factpack*.md`

4. **Known rejected approaches**
   - Search terms: topic + `CHANGES_REQUESTED` or `REWORK_REQUEST`
   - Expected sources: contours with `CHANGES_REQUESTED`, `REWORK_REQUEST.md`
   - **Always check** — prevents repeating rejected patterns

5. **Runtime/version/test rules**
   - Search terms: `RUNTIME_NAVIGATION`, `RUNTIME_PROOF_CHECKLIST`, `version proof`
   - Expected sources: `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`

6. **User preferences and hard rules**
   - Search terms: `AGENTS.md`, `forbidden`, `hard rule`
   - Expected sources: `AGENTS.md`, `Decisions/ADR-*.md`

### Planner Must Log in PLAN.md

```markdown
## RAG Preflight
- query terms: <terms used>
- retrieved sources: <list of paths/contour_ids>
- accepted context: <what influenced the plan>
- rejected/deprecated context: <what was discarded and why>
- how it changed plan: <delta from default approach>
```

### Query Template

```
Query: "contour category:{category} keywords:{keywords} truth:canonical"
Top-k: 5
Min score: 0.6
Boost: truth:canonical +2, CHANGES_REQUESTED +3, REVIEW_PASS +1
```

---

## 2. Agent 2 / Executor RAG Preflight Block

### Before Code, Query RAG For

1. **Files touched before in similar contours**
   - Search terms: file path + `EXEC_REPORT` + contour category
   - Expected sources: `EXEC_REPORT.md`, `IMPLEMENTATION_NOTES.md`

2. **Known regressions**
   - Search terms: file path + `regression` + contour id
   - Expected sources: `REGRESSION_ROOT_CAUSE.md`, `RUNTIME_BEFORE_AFTER.md`
   - **Critical** — prevents re-introducing fixed bugs

3. **Tests**
   - Search terms: module name + `test` + `.test.mjs` or `test_*.py`
   - Expected sources: existing test files for target modules

4. **Runtime proof requirements**
   - Search terms: `version badge`, `health check`, `runtime proof`
   - Expected sources: `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`

5. **Source maps**
   - Search terms: module name + `exports` or `imports`
   - Expected sources: `SOURCE_MAP.md`, code files with export/import summaries

6. **Rollback notes**
   - Search terms: contour id + `REWORK_REQUEST`
   - Expected sources: `REWORK_REQUEST.md`, `REWORK_RESPONSE.md`

### Executor Must Log in EXEC_REPORT.md

```markdown
## RAG Context Used
- sources: <list of paths/contour_ids>
- how used: <which decisions were influenced>
- limitations: <what RAG did not cover>
```

### Query Template

```
Query: "file:{module_path} regression|test|proof"
Top-k: 5
Min score: 0.5
Boost: CHANGES_REQUESTED +3, regression +2, test +1
```

---

## 3. Agent 3 / Reviewer RAG Preflight Block

### Before Review, Query RAG For

1. **User-visible scenario (acceptance criteria)**
   - Search terms: contour id + `Acceptance Criteria`
   - Expected sources: `PLAN.md` acceptance criteria section

2. **Previous user rejections**
   - Search terms: same area + `CHANGES_REQUESTED`
   - Expected sources: contours with `CHANGES_REQUESTED`, `REWORK_REQUEST.md`
   - **Critical** — enforces consistency with past rejections

3. **Fail conditions**
   - Search terms: contour id + `fail` or `forbidden`
   - Expected sources: `PLAN.md`, `REVIEW_REPORT.md`, `RUNTIME_PROOF_CHECKLIST.md`

4. **Version proof requirements**
   - Search terms: `version proof`, `runtime navigation`, `build-info`
   - Expected sources: `RUNTIME_NAVIGATION.md`, `VERSION_*_PROOF.md`

5. **Metrics thresholds**
   - Search terms: area + `baseline` or `threshold` or `profile`
   - Expected sources: `PERFORMANCE_AUDIT_REPORT.md`, `BASELINE_*.md`

### Reviewer Must Log in REVIEW_REPORT.md

```markdown
## RAG Review Context
- sources used: <list>
- exact acceptance criteria enforced: <criteria>
- pass type: <user-visible vs bounded/source-level>
- user rejection history checked: <yes/no, which contours>
```

### Query Template

```
Query: "contour:{contour_id} acceptance|criteria|fail|proof"
Top-k: 5
Min score: 0.6
Boost: truth:canonical +2, CHANGES_REQUESTED +3, audit +1
```

---

## 4. Context Logging Requirements

### PLAN.md (Agent 1)

Must include `## RAG Preflight` section with:
- Query terms used
- Retrieved sources (paths or contour ids)
- Accepted vs rejected context
- Plan delta attributed to RAG

### EXEC_REPORT.md (Agent 2)

Must include `## RAG Context Used` section with:
- Sources consulted
- How RAG influenced implementation decisions
- Limitations (gaps in coverage)

### REVIEW_REPORT.md (Agent 3)

Must include `## RAG Review Context` section with:
- Sources used for review
- Exact acceptance criteria enforced
- Pass type classification
- User rejection history verification

---

## 5. Read-Only Boundary in Prompts

Every agent prompt that uses RAG must include this paragraph:

> **RAG Boundary**: The RAG/RAK layer is strictly read-only. It provides context, suggestions, and warnings. It does NOT auto-mutate code, auto-save files, write BPMN XML, apply Product Actions, or override human review verdicts. Any RAG suggestion must be explicitly accepted by the human operator before application.

---

## 6. Fallback When RAG Unavailable

If the RAG service is unavailable or returns no results:

1. Agent proceeds with existing knowledge
2. Agent notes in report: `RAG unavailable — proceeding with baseline knowledge`
3. Agent performs manual file search (`grep`, `find`) as fallback
4. No blocking — RAG is enhancement, not gate

