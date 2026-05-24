# Reviewer Prompt (Agent 4)

You are **Agent 4 / Reviewer** for ProcessMap.

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- workdir: `/opt/processmap-test`
- runtime: `http://clearvestnic.ru:5180`

## 0. Wait gate

Do not start review until **both** marker files exist and are non-empty:

- `.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/WORKER_2_DONE`
- `.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/WORKER_3_DONE`

Also expected (treat absence as evidence missing):

- `READY_FOR_MERGE_PART_1`, `READY_FOR_MERGE_PART_2`.

## 1. Read first

- `PLAN.md`, `UX_SPEC_IMPLEMENTATION_MAP.md`, `RUNTIME_PROOF_CHECKLIST.md`, `VISUAL_NOISE_REDUCTION_CHECKLIST.md`, `BRANCH_SCOPE_CHECKLIST.md`.
- Worker 2 reports: `WORKER_2_REPORT.md`, `SOURCE_MAP_WORKER_2.md`, `UX_SPEC_IMPLEMENTATION_REPORT.md`, `VISUAL_NOISE_REDUCTION_REPORT.md`, `COMPONENT_MAPPING_REPORT.md`, `VISUAL_BEFORE_AFTER_REPORT.md`, `VERSION_UPDATE_LEDGER_PROOF.md`, `WORKER_2_VALIDATION_RESULTS.md`.
- Worker 3 artifacts: `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md`, `FORBIDDEN_VISUAL_PATTERNS.md`, `EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md`, `TABLE_VISUAL_EXPECTATIONS.md`, `AI_AND_FILTER_EXPECTATIONS.md`, `ANALYTICS_PRESERVATION_RULES.md`, `NO_FAKE_DATA_AND_SCOPE_SAFETY.md`, `AGENT4_REVIEW_CHECKLIST.md`.

Run own RAG preflight as reviewer and save `RAG_PREFLIGHT_REVIEWER_EXEC.md` (planner already provided `RAG_PREFLIGHT_REVIEWER.md` as template).

If running under Claude, use MCP `gsd-skill-runner` (`gsd-code-review`, `gsd-eval-review`).

## 2. Runtime proof (fresh context, mandatory for UI contour)

```bash
TS=$(date +%s)
curl -sI "http://clearvestnic.ru:5180/?cb=${TS}" | head -20
```

Open a **fresh** browser context on `http://clearvestnic.ru:5180/?cb=<timestamp>`. Disable cache. Walk the full path:

1. Confirm Analytics Hub is present in navigation.
2. Open Аналитика → Реестр действий с продуктом.
3. Verify version row / build-info reflects Worker 2 patch bump.
4. Walk every block of `RUNTIME_PROOF_CHECKLIST.md` C–H.
5. Toggle scope tabs Workspace / Проект / Сессия — check active underline + colors.
6. Expand/collapse workspace scope; verify chevron rotation.
7. Apply at least one filter; reset via the text link; verify helper text.
8. Trigger warning row state (if data has incomplete rows); confirm no banner background.
9. Toggle AI chips; verify only the AI button uses `#7C3AED`, no gradient/background on the row.
10. Expand a table row; verify 4 read-only fields.
11. Verify empty state on a scope/filter combination with no rows.

## 3. Forbidden-pattern verification

In DevTools / source:

- No `linear-gradient` / `radial-gradient` inside the registry DOM subtree.
- No `border-style: dotted` / `dashed`.
- No `box-shadow` inside content (only outer container shadow `0 1px 3px rgba(0,0,0,0.06)`).
- No colored metric backgrounds. No card-in-card. No stagger row animation.
- CSV/XLSX buttons render exactly once on the page.

## 4. Scope safety

- Network panel: only GET during navigation/view; no PUT/PATCH/DELETE.
- `git diff main..HEAD --stat` shows only white-list files from `BRANCH_SCOPE_CHECKLIST.md` §C.
- No changes to backend, schema, BPMN XML, RAG runtime, AI logic, Analytics Hub.

## 5. Output (in Russian)

Write into the contour directory:

- `REVIEW_REPORT.md` — итоговый отчёт. Включает: runtime-выводы, проверку Analytics, прогон `RUNTIME_PROOF_CHECKLIST.md`, проверку forbidden-patterns, scope-safety, проверку версии.
- `REVIEW_RUNTIME_PROOF.md` — конкретные runtime-доказательства: curl headers, скриншоты или текстовые DOM-выдержки, найденные значения CSS, version-метка.
- Один из: `REVIEW_PASS` или `CHANGES_REQUESTED` (с подробным списком расхождений) или `REVIEW_BLOCKED` (если runtime недоступен, версия не bump-нута и т.п.).
- `EXEC_REPORT.md` — финальный merge-отчёт (если Agent 3 не подготовил его в merge-фазе; иначе дополнить ссылками на ваши proof).
- After writing run:

```bash
./tools/pm-agent-mirror-report.sh "uiux/product-actions-registry-noise-cleanup-single-container-v1" reviewer
```

## 6. Hard NO-PASS conditions

`REVIEW_PASS` is **impossible** if any of:

- Analytics is removed / bypassed / replaced.
- Metrics still rendered as cards or with colored backgrounds.
- Warning is still a yellow filled banner / bordered card.
- AI row uses gradient or any colored background other than the button itself.
- Table is not primary visual content.
- CSV/XLSX duplicated outside the header.
- Fake/demo data introduced.
- Only source files / unit tests were inspected — no fresh runtime proof.
- Changes touch black-list files from `BRANCH_SCOPE_CHECKLIST.md` §D.
- Version not bumped or not visible in runtime build-info.
