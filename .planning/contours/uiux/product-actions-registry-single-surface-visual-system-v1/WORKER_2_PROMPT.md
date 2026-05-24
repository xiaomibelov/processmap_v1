# WORKER_2_PROMPT — implementation lane

Ты Agent 2 / Worker для контура `uiux/product-actions-registry-single-surface-visual-system-v1`.

Run ID: `20260518T110633Z-57765`.

## Цель

Реализовать bounded visual-system redesign существующей standalone-страницы `Реестр действий с продуктом` после удаления раздела `Аналитика`.

Это только registry UI contour. Не планируй и не восстанавливай Analytics Hub. Не добавляй `Реестр свойств`. Не создавай dashboards/export hub.

## Branch hygiene перед product-code edits

Текущий launcher checkout известен как dirty-risk. До любых edits обязательно:

1. Зафиксируй:
   - `pwd`
   - `git remote -v` без перепечатывания credential material в reports
   - `git fetch origin`
   - `git branch --show-current`
   - `git rev-parse HEAD`
   - `git rev-parse origin/main`
   - `git status -sb`
   - `git diff --name-only`
   - `git diff --cached --name-only`
2. Используй clean worktree/branch от `origin/main` и применяй только bounded registry UI changes.
3. Если остаешься в текущем checkout, письменно докажи, почему это безопасно.
4. Если безопасная изоляция невозможна, создай `EXEC_PART_1_BLOCKED.md` и остановись.

## Scope

Разрешено:

- registry-related frontend components/styles;
- version/build-info row по существующему repo pattern;
- focused tests только для затронутого registry UI.

Запрещено:

- backend, schema, BPMN XML, Product Actions durable truth;
- RAG runtime/tooling changes;
- AI behavior changes beyond UI placement;
- package install, TypeScript migration, shadcn installation;
- global ProcessMap shell/header/sidebar redesign;
- fake metrics/data;
- merge, PR, deploy.

## Visual implementation contract

Сделай страницу clean native ProcessMap working page:

- one unified white container below app shell;
- background `#FFFFFF`;
- border `1px solid #E5E7EB`;
- radius `12px`;
- only main container may have subtle shadow `0 1px 3px rgba(0,0,0,0.06)`;
- internal sections separated only by `1px solid #F3F4F6`;
- section padding `12px 24px`, header padding `16px 24px`;
- no internal card shadows;
- no gradients;
- no dotted borders;
- no colored metric cards;
- no aggressive warning banners;
- no colored border accents;
- no stagger animations.

Header:

- title `Реестр действий с продуктом`, `18px / 700 / #111827`;
- subtitle `13px / 400 / #6B7280`;
- `Вернуться` as arrow + text, `13px`, `#6B7280`, no border;
- CSV/XLSX only once in page header, compact outline style.

Scope:

- `Workspace / Проект / Сессия` as compact tabs;
- active `#111827` plus `2px` purple underline;
- inactive `#9CA3AF`;
- no dotted/pill-heavy disabled-card look.

Metrics:

- text-only row, no cards;
- number `20px / 700`;
- label `11px uppercase / #9CA3AF`;
- gap around `32px`;
- only `неполных` may be orange;
- `полных` is not green in metrics;
- `после фильтров` subdued or hidden/reduced if equal to total.

Filters:

- compact row if possible;
- seven selects: `Группа`, `Товар`, `Тип`, `Этап`, `Категория`, `Роль`, `Полнота`;
- height `34px`, min-width around `120px`, border `#E5E7EB`, radius `6px`;
- `Сбросить фильтры` is a text link, not framed button.

AI row:

- no gradient, no colored background;
- label `AI-предложения` uppercase secondary;
- toggle chips: `Все видимые`, `Без действий`, `Неполные`;
- primary purple CTA `AI: предложить действия`;
- selected counter small secondary;
- AI controls must not be inside sources/data section.

Warning:

- compact text row with warning icon;
- text `#B45309`;
- no yellow filled banner/card;
- optional `Показать только неполные` only if safe with existing filter model.

Table:

- main visual object;
- no new checkboxes unless existing selection model supports them safely;
- no zebra striping;
- sticky header only if safe;
- header `#FAFAFA`, uppercase `#6B7280`;
- rows use light separators and hover `#FAFAFA`;
- status badges are the only strong colored table elements:
  - `Полная`: `#ECFDF5 / #10B981`;
  - `Неполная`: `#FFFBEB / #F59E0B`;
- tags compact gray chips;
- BPMN code subdued `#9CA3AF`.

## Preservation rules

- Preserve existing data flow.
- Preserve exports.
- Preserve AI controls semantics.
- Preserve empty and populated states.
- Preserve route/navigation semantics for existing Product Actions Registry page.

## Required reports in Russian

Write all reports under `.planning/contours/uiux/product-actions-registry-single-surface-visual-system-v1/`:

- `WORKER_2_REPORT.md`
- `SOURCE_MAP_WORKER_2.md`
- `UX_SPEC_IMPLEMENTATION_REPORT.md`
- `VISUAL_NOISE_REDUCTION_REPORT.md`
- `VISUAL_BEFORE_AFTER_REPORT.md`
- `VERSION_UPDATE_LEDGER_PROOF.md`
- `WORKER_2_VALIDATION_RESULTS.md`
- marker `WORKER_2_DONE`

If blocked, write `EXEC_PART_1_BLOCKED.md` instead of partial implementation claims.

