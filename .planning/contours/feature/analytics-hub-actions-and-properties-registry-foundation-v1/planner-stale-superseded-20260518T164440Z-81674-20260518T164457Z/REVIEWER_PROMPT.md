# Agent 4 / Reviewer prompt

Contour: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Role: Agent 4 / Reviewer

Write all reports in Russian.

## Start condition

Final validation only. Wait for both markers:

- `WORKER_2_DONE`
- `WORKER_3_DONE`

Then perform independent review.

## Read first

- `PLAN.md`
- `WORKER_2_REPORT.md`
- `WORKER_3_REPORT.md`
- `ANALYTICS_RESTORE_ACCEPTANCE_CRITERIA.md`
- `REGISTRY_BOUNDARY_RULES.md`
- `PROPERTIES_CONFIRMED_VS_HYPOTHESIS.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `RAG_PREFLIGHT_REVIEWER.md`

## Required source/runtime truth

Run and record:

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
curl -s http://clearvestnic.ru:8088/health
curl -s http://clearvestnic.ru:5180/build-info.json
```

Redact credential-bearing remotes and do not print secrets.

## Browser validation

- Open fresh runtime on `http://clearvestnic.ru:5180`.
- Verify version/build-info.
- Open `Аналитика`.
- Verify Analytics exists and is not bypassed.
- Verify module entries:
  - `Реестр действий`
  - `Реестр свойств`
  - `Дашборды`
- Verify no separate `Экспорт` top-level Analytics card.
- Open `Реестр действий`.
- Verify current registry page renders and follows inner-page visual rules:
  - one white content container;
  - no gradients;
  - no dotted borders;
  - no colored metric cards;
  - no internal shadows;
  - light separators;
  - table primary;
  - CSV/XLSX in header;
  - AI controls in primary area;
  - sources secondary.
- Verify `Вернуться` returns to Analytics.
- Open `Реестр свойств`.
- Verify foundation page/placeholder is honest:
  - no fake data;
  - no fake counts;
  - clear future scope;
  - real data only if source-proven.
- Verify `Дашборды` is clearly future/placeholder.
- Verify global shell/header/sidebar unchanged.
- Verify no console errors.
- Verify no unsafe `PUT/PATCH/DELETE` from viewing/navigation.

## Scope validation

- No backend/schema/BPMN/RAG runtime changes.
- No Product Actions durable truth mutation.
- No RAG auto-indexer implementation.
- No package install.
- No fake metrics/data.

## No REVIEW_PASS if

- Analytics is missing.
- `Реестр действий` replaces Analytics.
- `Реестр свойств` is missing entirely.
- Export appears as separate top-level Analytics card.
- Product Actions Registry loses current runtime functionality.
- Fake property rows/counts are introduced.
- RAG auto-indexing is implemented in this contour.
- Backend/schema/BPMN/RAG changes appear out of scope.
- Only source/tests were checked without browser proof.

## Required outputs

- `REVIEW_REPORT.md`
- `RUNTIME_PROOF_CHECKLIST_FILLED.md`
- `REVIEW_PASS` if all gates pass.
- `CHANGES_REQUESTED` and `REWORK_REQUEST.md` if any blocking gate fails.
