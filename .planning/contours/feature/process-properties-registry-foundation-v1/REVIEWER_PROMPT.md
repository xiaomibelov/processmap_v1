# Agent 4 / Reviewer Prompt

Contour: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Role: Agent 4 / Reviewer

## Mission

Final validation only. Issue `REVIEW_PASS` only if runtime proof confirms a safe first foundation for `Реестр свойств`.

## Start condition

Wait for both markers:

- `WORKER_2_DONE`
- `WORKER_3_DONE`

If either worker produced a blocked marker instead, write `REVIEW_BLOCKED.md`.

## Language contract

- Keep this prompt execution in English if you need to reason.
- Write all review reports and Project Atlas notes in Russian.

## Preflight

Capture source/runtime truth:

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
curl -I http://clearvestnic.ru:5180
curl -sS http://clearvestnic.ru:8088/health
curl -sS http://clearvestnic.ru:5180/build-info.json
```

Redact credentials in reports.

## Read first

- `PLAN.md`
- `WORKER_2_REPORT.md`
- `SOURCE_MAP_WORKER_2.md`
- `PROPERTIES_SOURCE_IMPLEMENTATION_DECISION.md`
- `PROPERTIES_REGISTRY_IMPLEMENTATION_REPORT.md`
- `ANALYTICS_NAVIGATION_REPORT.md`
- `WORKER_2_VALIDATION_RESULTS.md`
- `WORKER_3_REPORT.md`
- `PROPERTIES_SOURCE_TRUTH_REVIEW.md`
- `PROPERTIES_CONFIRMED_VS_HYPOTHESIS.md`
- `PROPERTIES_REGISTRY_UX_ACCEPTANCE_CRITERIA.md`
- `NO_FAKE_PROPERTIES_RULES.md`
- `FUTURE_BACKEND_API_REQUIREMENTS.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `RAG_PREFLIGHT_REVIEWER.md`

## Runtime scenario

Use fresh browser context against:

```text
http://clearvestnic.ru:5180
```

Validate:

- Open `Аналитика`.
- Verify top-level Analytics still exists.
- Verify module entries:
  - `Реестр действий`;
  - `Реестр свойств`;
  - `Дашборды`.
- Open `Реестр свойств`.
- Verify title: `Реестр свойств`.
- Verify subtitle: `Сводный список свойств BPMN-элементов и процессных объектов.`
- Verify `Вернуться`.
- Verify scope selector.
- Verify metrics row.
- Verify filters/table if data mode is active.
- Verify honest foundation empty state if real rows are unavailable.
- Verify source truth note.
- Verify `Вернуться` returns to Analytics.
- Verify `Реестр действий` still opens and works.
- Verify global shell/header/sidebar unchanged.
- Verify console clean.
- Verify no unsafe `PUT/PATCH/DELETE` from viewing/navigation.

## No REVIEW_PASS if

- Analytics is missing.
- `Реестр свойств` is missing from Analytics.
- fake property rows or fake counts are shown.
- property data source is not documented.
- BPMN XML is mutated.
- Product Actions durable truth is changed.
- backend/schema changes appear without explicit scope.
- RAG runtime implementation appears.
- only source/tests were checked without browser proof.

## Required review artifacts in Russian

Write under:

```text
/opt/processmap-test/.planning/contours/feature/process-properties-registry-foundation-v1/
```

Required:

- `REVIEW_REPORT.md`
- `RUNTIME_PROOF_CHECKLIST_FILLED.md`
- `REVIEW_RUN_ID`
- either `REVIEW_PASS` or `CHANGES_REQUESTED`

If blocked:

- `REVIEW_BLOCKED.md`

If requesting changes:

- `REWORK_REQUEST.md`
