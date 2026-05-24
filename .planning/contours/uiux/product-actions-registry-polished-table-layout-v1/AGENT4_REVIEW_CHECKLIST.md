# Agent 4 Review Checklist

Контур: `uiux/product-actions-registry-polished-table-layout-v1`

## Gate 0 - source/runtime truth

- [ ] Record `pwd`.
- [ ] Record remote truth without secrets.
- [ ] Run `git fetch origin`.
- [ ] Record branch, `HEAD`, `origin/main`.
- [ ] Record `git status -sb`, unstaged diff names, staged diff names.
- [ ] Identify implementation worktree/branch/commit from Agent 2.
- [ ] Confirm Part 2 artifacts are checklist-only and do not contain product code edits.

## Gate 1 - served runtime

- [ ] Verify `http://clearvestnic.ru:5180` is reachable.
- [ ] Capture build/version info and served commit/contour marker.
- [ ] Prove browser receives the intended implementation, not stale local expectations.
- [ ] Use fresh context/cache-busting.

## Gate 2 - navigation path

- [ ] Open Analytics Hub.
- [ ] Navigate to `Реестр действий`.
- [ ] Confirm Analytics Hub compatibility is preserved.
- [ ] Confirm global ProcessMap shell is not redesigned by this contour.

## Gate 3 - header and exports

- [ ] Title `Реестр действий с продуктом` is the strongest page text.
- [ ] Subtitle is readable and secondary.
- [ ] `Вернуться` is compact/navigation-like.
- [ ] CSV/XLSX appear exactly once and only in header utility area.

## Gate 4 - metrics

- [ ] Metrics form a compact dashboard/card.
- [ ] Values are noticeable but not oversized.
- [ ] Labels are secondary/small/uppercase-style.
- [ ] `Полных`/`Неполных` have subtle semantic color treatment.
- [ ] `После фильтров` is secondary if it duplicates total.
- [ ] Counts match real current scope and filters.

## Gate 5 - filters

- [ ] Main filters grouped: `Группа`, `Товар`, `Тип`, `Этап`, `Категория`.
- [ ] Secondary filters grouped: `Роль`, `Полнота`, `Сбросить`.
- [ ] Applied filter values are visually discoverable.
- [ ] Reset is quiet text/link style and works.
- [ ] No applied filters state is calm and uncluttered.

## Gate 6 - AI controls

- [ ] `AI-предложения` label is visible.
- [ ] `Все видимые`, `Без действий`, `Неполные` are secondary toggle chips.
- [ ] `AI: предложить действия` is primary CTA.
- [ ] `Выбрано для AI: 0/10` or current count is adjacent and secondary.
- [ ] AI controls are in primary actions area, not in `Источники данных`.
- [ ] No AI backend/prompt/behavior change is required for pass.

## Gate 7 - warning

- [ ] Incomplete-row warning appears above table when relevant.
- [ ] Warning visual tone is soft, not critical-error style.
- [ ] `Показать только неполные` exists and works if implemented.
- [ ] If quick action is skipped, skip is documented and no broken action appears.

## Gate 8 - table

- [ ] Table is the main working area and uses workspace width well.
- [ ] Header is calm and aligned.
- [ ] Rows have separation and hover state.
- [ ] `Полная`/`Неполная` badges are consistent and aligned.
- [ ] Tags are compact.
- [ ] BPMN code treatment is muted.
- [ ] Checkbox column exists only if selection model is safe.
- [ ] Empty/no-results states preserve table shell without fake rows.

## Gate 9 - scopes

- [ ] Populated project scope uses real Product Actions rows and truthful metrics.
- [ ] Empty workspace scope shows honest empty state with no fake data.
- [ ] Empty workspace does not crash and does not hide the page shell.
- [ ] Filtered empty result is distinguishable from empty workspace.

## Gate 10 - sources and layout

- [ ] Sources section is secondary after table/pagination.
- [ ] Sources do not contain export controls or primary AI controls.
- [ ] Section rhythm is clear; no single grey continuous sheet.
- [ ] Page does not feel like a narrow pasted panel.
- [ ] Text and controls do not overlap on review viewport.

## Gate 11 - safety and five planes

- [ ] Code plane: exact implementation commit/branch recorded and diff bounded.
- [ ] Workspace plane: serving workspace/worktree identified.
- [ ] DB plane: durable Product Actions remain real `interview.analysis.product_actions[]`.
- [ ] Env/compose plane: active server/compose/process recorded.
- [ ] Serving mode plane: browser proof confirms actual served implementation.
- [ ] Console clean enough for this scope.
- [ ] Viewing/navigation/filtering emits no unexpected unsafe `PUT`, `PATCH`, `DELETE`.
- [ ] No backend/schema/BPMN/RAG/AI behavior/dependency changes.

## Pass rule

Issue `REVIEW_PASS` only if all applicable gates pass with fresh runtime evidence. If a planned optional item is safely skipped, the skip must be documented by Agent 2 and must not leave a broken or misleading UI element.
