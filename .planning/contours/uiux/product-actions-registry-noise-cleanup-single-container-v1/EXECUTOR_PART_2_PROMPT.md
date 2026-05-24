# Executor Part 2 / Worker 3 — Independent UX/spec/checklist lane

You are **Agent 3 / Worker (UX/spec/checklist)** for ProcessMap.

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- workdir: `/opt/processmap-test`

You run **in parallel** with Agent 2 / Worker 2. You **do not** validate Worker 2, **do not** wait for `WORKER_2_DONE`, **do not** read Worker 2 implementation artifacts, **do not** depend on Worker 2 in any way. Your output is independently consumable by Agent 4.

## 0. Read first

- `.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/PLAN.md`
- `.../UX_SPEC_IMPLEMENTATION_MAP.md`
- `.../VISUAL_NOISE_REDUCTION_CHECKLIST.md`
- `.../COMPONENT_MAPPING_REQUIREMENTS.md`
- `.../RUNTIME_PROOF_CHECKLIST.md`
- `.../RAG_PREFLIGHT_PLANNER.md`
- `.../OBSIDIAN_CONTEXT_USED.md`
- `.../GSD_CONTEXT_USED.md`

Run your own RAG preflight as `reviewer-prep`/`spec-lane`:

```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer \
  --contour "uiux/product-actions-registry-noise-cleanup-single-container-v1" \
  --area "product actions registry visual acceptance criteria" \
  --format md --top-k 10
```

Save output as `RAG_PREFLIGHT_WORKER_3.md`.

If running under Claude, use MCP `gsd-skill-runner` (`list_skills`, then `gsd-eval-review` or `gsd-audit-fix`).

## 1. Goal

Convert the full UX spec into independent, runtime-verifiable artifacts that Agent 4 can use directly. Output is in **Russian**, exact and exhaustive.

## 2. Hard rules

- Independent lane. **Do not** reference Worker 2's implementation, files, or progress.
- **Do not** write product code.
- **Do not** merge, deploy, or open a PR.
- **Do not** introduce or assume fake data.
- Stay strictly inside `.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/`.

## 3. Required artifacts (all in Russian)

Write into the contour directory:

1. `WORKER_3_REPORT.md` — резюме лейна, ссылки на остальные артефакты, статус.
2. `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md` — exhaustive checklist (по разделам спека §1–§16): «что должно быть видно», измеримо в DOM/CSS/runtime. Каждое — yes/no.
3. `FORBIDDEN_VISUAL_PATTERNS.md` — конкретные запрещённые DOM/CSS-паттерны с примерами grep/devtools selectors.
4. `EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md` — поведение страницы при наличии и отсутствии данных, для каждого scope (Workspace/Проект/Сессия).
5. `TABLE_VISUAL_EXPECTATIONS.md` — детальная спецификация таблицы: колонки 20/25/35/20, header `#FAFAFA`, hover `#FAFAFA`, badges, row expansion, BPMN code subdued, типографика.
6. `AI_AND_FILTER_EXPECTATIONS.md` — AI row + Filters row: layout, цвета, chips, кнопки, helper-text, reset как text-link.
7. `ANALYTICS_PRESERVATION_RULES.md` — правила сохранения Analytics IA (Аналитика → Реестр действий | Реестр свойств | Дашборды); запрещено удалять Analytics, обходить Analytics, повышать «Реестр» на верхний уровень.
8. `NO_FAKE_DATA_AND_SCOPE_SAFETY.md` — критерии fake-data и scope-safety: GET-only при просмотре, без backend/schema/BPMN/RAG-мутаций.
9. `AGENT4_REVIEW_CHECKLIST.md` — единый чек-лист для Reviewer, использующий пункты выше + `RUNTIME_PROOF_CHECKLIST.md`. Должен быть готов к копированию в `REVIEW_REPORT.md` чекбоксами.
10. `RAG_PREFLIGHT_WORKER_3.md`.
11. `WORKER_3_DONE` — пустой маркер, создаётся последним.
12. `READY_FOR_MERGE_PART_2` — пустой маркер для merge-фазы Agent 3.

## 4. Structure conventions for the checklists

- Каждый пункт чек-листа: `- [ ] Краткое утверждение — измеримый критерий (CSS-свойство, DOM-структура, значение).`
- Группировать по разделам спека: Header / Tabs / Container / Workspace scope / Sessions workspace / Metrics / Filters / Warning / AI / Table / Row expansion / Empty state / Animations / Data safety / Version row.
- Каждый forbidden-pattern: укажи (а) что запрещено, (б) почему, (в) команду grep / DevTools selector.

## 5. Mirror

```bash
./tools/pm-agent-mirror-report.sh "uiux/product-actions-registry-noise-cleanup-single-container-v1" executor
```

## 6. If blocked

Create `EXEC_PART_2_BLOCKED.md` с конкретной причиной. Не создавать `WORKER_3_DONE` / `READY_FOR_MERGE_PART_2` при блоке.

## 7. Запрещённые формулировки в ваших артефактах

В тексте Worker 3 prompt-артефактов **не** должны встречаться формулировки, означающие зависимость от Worker 2:

- «validate Worker 2», «после Worker 2», «depends on Worker 2», «review Worker 2», «wait for WORKER_2_DONE».

Если такой пункт логически возникает — он принадлежит Agent 4 / Reviewer, не вам.
