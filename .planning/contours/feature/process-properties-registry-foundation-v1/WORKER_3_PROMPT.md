# Agent 3 / Worker Prompt

Contour: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Role: Agent 3 / Worker — independent source-truth / UX checklist lane

## Mission

Produce independent source-truth and UX acceptance materials for `Реестр свойств`.

This is a non-product-code lane. Work from repository/docs evidence and write Russian reports.

## Language contract

- Keep this prompt execution in English if you need to reason.
- Write all reports and Project Atlas notes in Russian.

## Preflight

Capture source truth:

```bash
pwd
git remote -v
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

Redact credentials in reports.

## Independence rule

Operate independently from the implementation lane. Do not use implementation-lane reports as prerequisites for your work. Your job is to define source-truth and UX rules from current code/docs evidence.

## Scope

- Inspect code/docs for property sources.
- Build confirmed-vs-hypothesis matrix.
- Define minimum acceptable `Реестр свойств` UX for:
  - real-data mode;
  - empty/foundation mode.
- Define what must not be shown as fake data.
- Define future backend/API requirements if current data is insufficient.
- Prepare Agent 4 runtime review checklist.
- Write reports in Russian.
- Create `WORKER_3_DONE`.

## Source classification

Classify every candidate as:

1. confirmed current source;
2. available but not suitable for this contour;
3. hypothesis/future;
4. requires backend/API work later.

Candidate areas:

- BPMN element properties;
- Camunda/BPMN extension attributes already parsed;
- `bpmn_meta_json / nodes_json / edges_json` if exposed safely to frontend;
- diagram property overlays;
- DoD / quality / role / lane / equipment / product-related properties if already present;
- process step metadata;
- existing property panel models;
- existing overlay/decor managers;
- existing analysis/interview/session state.

## UX acceptance

Define acceptance for:

- Analytics Hub module entry `Реестр свойств`;
- navigation into the page;
- `Вернуться`;
- scope selector semantics;
- metrics row truthfulness;
- filters that map only to real data;
- table columns;
- empty/foundation state;
- source truth note;
- no fake rows/counts.

## Required reports in Russian

Write all under:

```text
/opt/processmap-test/.planning/contours/feature/process-properties-registry-foundation-v1/
```

Required:

- `WORKER_3_REPORT.md`
- `PROPERTIES_SOURCE_TRUTH_REVIEW.md`
- `PROPERTIES_CONFIRMED_VS_HYPOTHESIS.md`
- `PROPERTIES_REGISTRY_UX_ACCEPTANCE_CRITERIA.md`
- `NO_FAKE_PROPERTIES_RULES.md`
- `FUTURE_BACKEND_API_REQUIREMENTS.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `WORKER_3_DONE`

If blocked, write:

- `EXEC_PART_2_BLOCKED.md`

Do not create `WORKER_3_DONE` if blocked.

## Non-goals

- no product code changes;
- no backend/schema changes;
- no BPMN XML writes;
- no Product Actions durable truth mutation;
- no RAG runtime implementation;
- no fake registry examples as data.
