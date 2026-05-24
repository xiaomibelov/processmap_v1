# AGENT4_REVIEW_CHECKLIST

Контур: `uiux/product-actions-registry-single-surface-visual-system-v1`  
Назначение: runtime checklist для Agent 4 после готовности `WORKER_2_DONE` и `WORKER_3_DONE`.

## Start gate

- [ ] Есть `WORKER_2_DONE`.
- [ ] Есть `WORKER_3_DONE`.
- [ ] Нет `EXEC_PART_1_BLOCKED.md`.
- [ ] Нет `EXEC_PART_2_BLOCKED.md`.

## Source/runtime truth

- [ ] Зафиксирован `pwd`.
- [ ] Зафиксирован remote без credential leakage.
- [ ] Выполнен `git fetch origin`.
- [ ] Зафиксирована branch.
- [ ] Зафиксирован `HEAD`.
- [ ] Зафиксирован `origin/main`.
- [ ] Зафиксирован `git status -sb`.
- [ ] Зафиксирован `git diff --name-only`.
- [ ] Зафиксирован `git diff --cached --name-only`.
- [ ] Получен fresh `/build-info.json` с `http://clearvestnic.ru:5180`.
- [ ] Доказано `intended == served`.

## 5 planes

- [ ] Code plane: branch/commit реально содержит implementation fix.
- [ ] Workspace plane: checkout/worktree реально использовался для build.
- [ ] DB plane: Product Actions durable state после сценария понятен и не испорчен.
- [ ] Env/compose plane: активный compose/gateway/static stack зафиксирован.
- [ ] Serving mode plane: `:5180` реально отдает intended dist/build.

## Navigation

- [ ] Fresh browser context открыт.
- [ ] `http://clearvestnic.ru:5180` доступен.
- [ ] Пользователь может открыть `Реестр действий с продуктом`.
- [ ] Страница не является Analytics Hub.
- [ ] Нет dependency на `Реестр свойств`.

## Visual system

- [ ] Один unified white container.
- [ ] Внутренние sections разделены separators, а не card stack.
- [ ] Нет gradients.
- [ ] Нет dotted borders.
- [ ] Нет internal shadows.
- [ ] Нет colored metric cards.
- [ ] Нет disconnected visual styles.

## Header and exports

- [ ] Header hierarchy compact and clear.
- [ ] `Вернуться` как text action with arrow.
- [ ] CSV/XLSX только один раз в header.
- [ ] Export controls не превращены в отдельный hub.

## Scope, metrics, filters

- [ ] Scope selector compact tabs.
- [ ] Active tab dark text plus purple underline.
- [ ] Inactive tabs subdued.
- [ ] Metrics text-only.
- [ ] `неполных` может быть orange; `полных` не green.
- [ ] Filters compact row with expected 7 filters where possible.
- [ ] `Сбросить фильтры` text link.

## AI and warning

- [ ] AI row внутри primary registry surface.
- [ ] AI row без gradient/background banner.
- [ ] Purple только для AI CTA and active underline.
- [ ] Toggle chips: `Все видимые`, `Без действий`, `Неполные`.
- [ ] Warning compact text row, not filled yellow banner.
- [ ] Warning link, если есть, безопасно включает incomplete filter.

## Table

- [ ] Table is main visual object.
- [ ] Header `#FAFAFA`, uppercase `#6B7280`.
- [ ] Rows light separators.
- [ ] Hover `#FAFAFA`.
- [ ] No zebra striping.
- [ ] Status badges only strong green/orange.
- [ ] Tags compact gray chips.
- [ ] BPMN code subdued.
- [ ] No unsupported checkboxes.

## Empty and populated states

- [ ] Populated project/session/workspace state uses real data.
- [ ] Empty state has no fake rows or fake metrics.
- [ ] Scope switch does not mix data.
- [ ] Filters and warning reflect real visible dataset.

## Safety

- [ ] Browser console has no blocking errors.
- [ ] Network has no unsafe `PUT/PATCH/DELETE` during passive viewing/navigation/filtering unless explicitly allowlisted.
- [ ] No backend/schema/BPMN/RAG runtime changes are required by this contour.
- [ ] No Product Actions durable truth mutation from viewing.

## Verdict rule

- [ ] `REVIEW_PASS` only if visual review, source/runtime truth and 5 planes all pass.
- [ ] `BLOCKED` if `intended != served`.
- [ ] `CHANGES_REQUESTED` if served runtime is correct but visual/spec criteria fail.
