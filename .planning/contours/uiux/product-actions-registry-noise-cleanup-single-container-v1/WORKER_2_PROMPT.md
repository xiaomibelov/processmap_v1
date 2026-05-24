# Executor Part 1 / Worker 2 — Implementation lane

You are **Agent 2 / Worker (Implementation)** for ProcessMap.

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- workdir: `/opt/processmap-test`
- main branch for any future PR: `main`

You start in parallel with Agent 3 / Worker 3. **You must not wait for Worker 3.** You also do not wait for the Reviewer.

## 0. Read first

Read the full planning pack before touching any code:

- `.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/PLAN.md`
- `.../UX_SPEC_IMPLEMENTATION_MAP.md`
- `.../VISUAL_NOISE_REDUCTION_CHECKLIST.md`
- `.../COMPONENT_MAPPING_REQUIREMENTS.md`
- `.../BRANCH_SCOPE_CHECKLIST.md`
- `.../RAG_PREFLIGHT_PLANNER.md`
- `.../OBSIDIAN_CONTEXT_USED.md`
- `.../GSD_CONTEXT_USED.md`

Run your own RAG preflight as `executor`, save the output to `RAG_PREFLIGHT_EXECUTOR.md`:

```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "uiux/product-actions-registry-noise-cleanup-single-container-v1" \
  --area "product actions registry inner page UX cleanup" \
  --format md --top-k 10
```

If running under Claude, use MCP `gsd-skill-runner` first (`list_skills`, then invoke `gsd-do` or similar).

## 1. Goal

Implement the bounded visual-system rework of the inner page **«Реестр действий с продуктом»** strictly according to the UX spec captured in `PLAN.md` and `UX_SPEC_IMPLEMENTATION_MAP.md`.

Formula: **One container. One separator. Typography over decoration.** No gradients. No dotted. No inner shadows. No colored metric cards. AI purple only for AI. Green/orange only for status badges and warning semantics.

## 2. Hard scope rules

- **Preserve** the top-level «Аналитика» section and `ProcessAnalyticsHub.jsx`. «Реестр действий» stays an inner module.
- **Do not** redesign the global shell, header, sidebar, Analytics Hub itself, «Реестр свойств», or dashboards.
- **Do not** add dependencies. Do not migrate to TS/Tailwind/shadcn/lucide if not already present.
- **Do not** mutate durable truth: BPMN XML, Product Actions, backend, schema, RAG, AI logic.
- **Do not** introduce fake data. Use real data hooks; show empty state if data missing.
- **Do not** open a PR, merge, or deploy.
- Stay strictly inside the white-list in `BRANCH_SCOPE_CHECKLIST.md` §C. Refuse to touch black-list files §D.

## 3. Branch hygiene (required before implementation)

Follow `BRANCH_SCOPE_CHECKLIST.md` §B. Choose one: clean worktree from `origin/main`, or justified current checkout. Record the chosen path and the base SHA in `WORKER_2_REPORT.md`. Do not silently add to a dirty tree.

## 4. Implementation order

1. Inspect real registry files listed in `COMPONENT_MAPPING_REQUIREMENTS.md` §A.
2. Map current DOM/CSS to the target spec; record findings in `SOURCE_MAP_WORKER_2.md`.
3. Apply changes file-by-file:
   - Header → `registry/ProductActionsRegistryHeader.jsx` (single source of CSV/XLSX and «Вернуться»).
   - Page composition → `ProductActionsRegistryPage.jsx` (Header + Scope tabs + 16px gap + Panel).
   - Single white container → `ProductActionsRegistryPanel.jsx` with 1px `#F3F4F6` dividers between 7 sections.
   - Workspace scope collapsible (default collapsed).
   - Sessions workspace compact list (not a table).
   - Metrics: convert cards → single text row (gap 32, no backgrounds, incomplete number `#F59E0B`).
   - Filters: single compact row with 34px selectors, text-link reset, helper text 12/`#9CA3AF`.
   - Warning row: icon + text + right link, no yellow background, no border.
   - AI suggestions: label + chips + `#7C3AED` button + counter, no gradient/background.
   - Registry table: 4 columns 20/25/35/20, header `#FAFAFA`, hover `#FAFAFA`, badges, row expansion (chevron rotate + max-height) with 4 read-only fields.
4. CSS: only local registry CSS. No global/BPMN/legacy edits.
5. Bump version in `frontend/src/config/appVersion.js` (patch increment). Capture proof in `VERSION_UPDATE_LEDGER_PROOF.md`.

## 5. Validations you must run

```bash
# Lint/test scope of registry
node --experimental-vm-modules ./node_modules/.bin/mocha \
  frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs \
  frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs 2>&1 | tail -40

# Forbidden-pattern grep
rg -n "linear-gradient|radial-gradient|dotted|dashed" \
  frontend/src/components/process/analysis frontend/src/styles | grep -v '0 1px 3px '

# CSV/XLSX duplication audit
rg -n "CSV|XLSX|Экспорт" frontend/src/components/process/analysis
```

Capture command output in `WORKER_2_VALIDATION_RESULTS.md`.

## 6. Required reports (in Russian)

Write into `.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/`:

- `WORKER_2_REPORT.md` — summary, base SHA, list of changed files, diff stats, links to other reports.
- `SOURCE_MAP_WORKER_2.md` — current → target mapping per file.
- `UX_SPEC_IMPLEMENTATION_REPORT.md` — раздел спека → реализация → proof (selectors, классы).
- `VISUAL_NOISE_REDUCTION_REPORT.md` — что удалено/упрощено (gradients/dotted/shadows/cards).
- `COMPONENT_MAPPING_REPORT.md` — итоговый mapping компонентов; обоснование любых замен.
- `VISUAL_BEFORE_AFTER_REPORT.md` — до/после словесно + ссылки на screenshot paths (если делал).
- `VERSION_UPDATE_LEDGER_PROOF.md` — diff `appVersion.js` + новая версия + где она видна.
- `WORKER_2_VALIDATION_RESULTS.md` — вывод команд из §5.
- `RAG_PREFLIGHT_EXECUTOR.md`.
- `WORKER_2_DONE` — пустой маркер, **создаётся последним**.
- `READY_FOR_MERGE_PART_1` — пустой маркер для Agent 3 merge-фазы.

## 7. Mirror

After writing reports run:

```bash
./tools/pm-agent-mirror-report.sh "uiux/product-actions-registry-noise-cleanup-single-container-v1" executor
```

## 8. If blocked

Create `EXEC_PART_1_BLOCKED.md` with:

- Exact blocker (file, error, env reason).
- Reproduction command.
- Minimum unblock action requested.

Do **not** create `WORKER_2_DONE` or `READY_FOR_MERGE_PART_1` if blocked.
