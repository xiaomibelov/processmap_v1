# PLAN — uiux/product-actions-registry-single-surface-visual-system-v1

## 1. Контур и продуктовая рамка

- Контур: `uiux/product-actions-registry-single-surface-visual-system-v1`.
- Run ID: `20260518T110633Z-57765`.
- Роль текущего агента: Agent 1 / Planner.
- Целевой экран: существующая standalone-страница `Реестр действий с продуктом`.
- Продуктовое направление: раздел `Аналитика` удален. Единственная активная поверхность в этом контуре — `Реестр действий с продуктом`.
- Запрещено планировать Analytics Hub, возвращать analytics cards, добавлять `Реестр свойств`, строить dashboard/export hub или менять runtime-логику данных.

## 2. Source/runtime truth на момент планирования

- `pwd`: `/opt/processmap-test`.
- Текущая ветка: `fix/lockfile-sync-test`.
- `HEAD`: `5b20bc2d1292f419647238eaf37dac55f9315942`.
- `origin/main` после `git fetch origin`: `d805e1c64c1107b9e3fe6854e031694bf741b187`.
- `git status -sb`: dirty tree, есть измененные frontend-файлы и много untracked artifacts.
- `git diff --cached --name-only`: пусто.
- Remote содержит credential material в URL, поэтому URL не перепечатывается в артефактах. Это отличается от canonical SSH remote из operating contract и должно считаться branch/source-risk до доказанной изоляции.

Вывод: planning-only шаг допустим, но product-code edits в этом checkout запрещены без отдельного доказательства безопасной изоляции. Worker 2 обязан использовать clean worktree/branch от `origin/main` или явно доказать, почему текущий checkout безопасен.

## 3. GSD/RAG/Obsidian preflight

- `command -v gsd`: найден `/opt/processmap-test/bin/gsd`.
- `gsd usage`: не поддерживается локальным wrapper (`Unknown command: usage`).
- `gsd` без аргументов возвращает список доступных команд `gsd-tools`.
- Planner RAG preflight выполнен и сохранен в `RAG_PREFLIGHT_PLANNER.md`.
- Reviewer RAG preflight выполнен и сохранен в `RAG_PREFLIGHT_REVIEWER.md`.
- RAG использовать только как read-only context layer. RAG не является runtime/source truth и не может автоматически мутировать код, BPMN XML, Product Actions или planning state.
- Obsidian-first контекст прочитан: `EPIC BOARD`, `ACTIVE TASKS`, ADR по Product Actions AI, operating contract handoff и релевантные handoff по предыдущим registry/analytics контурам.

## 4. User-visible проблема

Текущая страница реестра выглядит визуально шумной и дешевой:

- слишком много несвязанных визуальных стилей;
- слабая иерархия;
- прозрачные серые блоки;
- scope, metrics, filters, AI, warning и table не выглядят как единая система;
- пользователь не понимает страницу быстро;
- таблица не ощущается как отполированный рабочий инструмент.

## 5. Design source summary

Основной дизайн-источник: UX/UI spec с принципом:

> One container. One separator. Typography over decoration. No gradients. No dotted borders. No internal shadows. No colored metric cards. AI purple only for AI. Green/orange only for statuses.

Перевод в implementation scope:

- все содержимое под app shell живет внутри одного белого контейнера;
- внутренние блоки не являются отдельными cards;
- разделение выполняется только горизонтальными separators;
- таблица — главный визуальный объект;
- цвет работает только как смысловой сигнал: purple для AI CTA, green/orange только для status badges, orange для `неполных` в metrics/warning.

## 6. Строгие визуальные правила

### Главный контейнер

- Background `#FFFFFF`.
- Border `1px solid #E5E7EB`.
- Radius `12px`.
- Внутренних card shadows нет.
- Только основной контейнер может иметь subtle shadow `0 1px 3px rgba(0,0,0,0.06)`.

### Запрещенный visual noise

- gradients;
- dotted borders;
- colored metric cards;
- internal shadows;
- multiple card styles;
- aggressive warning banners;
- colored border accents;
- stagger animations.

### Header

- Заголовок: `Реестр действий с продуктом`, `18px / 700 / #111827`.
- Subtitle: `13px / 400 / #6B7280`.
- `Вернуться`: arrow + text, `13px`, `#6B7280`, без border.
- CSV/XLSX только в page header, outline style, compact.

### Scope selector

- `Workspace / Проект / Сессия` выглядят как compact tabs.
- Active: `#111827` + purple underline `2px`.
- Inactive: `#9CA3AF`.
- Без dotted/pill-heavy styling.
- Scope selector не должен выглядеть как disabled gray cards.

### Metrics

- Никаких metric cards.
- Text-only row.
- Number: `20px / 700`.
- Label: `11px uppercase / #9CA3AF`.
- Gap около `32px`.
- Только `неполных` может использовать orange.
- `полных` не зеленый в metrics.
- `после фильтров` subdued или hidden/reduced, если равно total.

### Filters

- По возможности одна compact row.
- 7 selects: `Группа`, `Товар`, `Тип`, `Этап`, `Категория`, `Роль`, `Полнота`.
- Height `34px`.
- Min-width около `120px`.
- Border `#E5E7EB`.
- Radius `6px`.
- `Сбросить фильтры` — text link, не framed button.

### AI row

- Без gradient.
- Без colored background.
- Label `AI-предложения` uppercase secondary.
- Toggle chips: `Все видимые`, `Без действий`, `Неполные`.
- Primary CTA остается purple: `AI: предложить действия`.
- Selected counter small secondary.
- AI controls не должны жить в sources/data section.

### Warning

- Не yellow filled banner/card.
- Compact text row с warning icon.
- Text `#B45309`.
- Optional link `Показать только неполные`, если безопасно.

### Table

- Таблица — главный визуальный объект.
- Checkboxes не добавлять, если текущая data/selection model не поддерживает их безопасно.
- Без zebra striping.
- Sticky header только если безопасно.
- Header: `#FAFAFA`, uppercase `#6B7280`.
- Rows: light separators, hover `#FAFAFA`.
- Status badges — единственные сильные цветные элементы таблицы:
  - `Полная`: `#ECFDF5 / #10B981`.
  - `Неполная`: `#FFFBEB / #F59E0B`.
- Tags: compact gray chips.
- BPMN code: subdued `#9CA3AF`.

### Section rhythm

- Без margins между внутренними sections.
- Только separators `1px solid #F3F4F6`.
- Section padding `12px 24px`.
- Header padding `16px 24px`.

## 7. Exact non-goals

- No Analytics Hub.
- No Properties Registry.
- No dashboards.
- No backend changes.
- No schema changes.
- No BPMN XML changes.
- No Product Actions durable truth changes.
- No RAG runtime changes.
- No AI behavior change beyond UI placement.
- No package install.
- No TypeScript migration.
- No shadcn installation.
- No fake metrics/data.
- No global ProcessMap shell/header/sidebar redesign.
- No merge, PR, release, deploy.

## 8. Decomposition-first rule

Этот контур split-friendly:

- Agent 2 делает bounded UI implementation lane.
- Agent 3 делает независимый UX/spec/checklist lane.
- Agent 4 выполняет финальную runtime validation только после двух worker-маркеров.

Agent 3 не должен использовать результаты implementation lane как вход для своей независимой части. Зависимая интеграционная проверка принадлежит Agent 4.

## 9. Worker split

### Agent 2 / Worker — implementation lane

Independent scope:

- реализовать bounded visual-system redesign страницы `Реестр действий с продуктом`;
- использовать actual repo stack и существующие patterns;
- трогать только registry-related frontend components/styles, если нет доказанной необходимости;
- убрать gradients, dotted borders, colored metric cards, internal shadows, excessive cards;
- собрать один white container с internal separators;
- уточнить header, scope tabs, metrics, filters, AI row, warning row, table;
- сохранить data flow, exports, AI controls semantics, empty/populated states;
- обновить version row/build-info source по существующему repo pattern;
- писать reports на русском;
- создать `WORKER_2_DONE`;
- при блокировке создать `EXEC_PART_1_BLOCKED.md`.

Required reports:

- `WORKER_2_REPORT.md`
- `SOURCE_MAP_WORKER_2.md`
- `UX_SPEC_IMPLEMENTATION_REPORT.md`
- `VISUAL_NOISE_REDUCTION_REPORT.md`
- `VISUAL_BEFORE_AFTER_REPORT.md`
- `VERSION_UPDATE_LEDGER_PROOF.md`
- `WORKER_2_VALIDATION_RESULTS.md`
- `WORKER_2_DONE`

### Agent 3 / Worker — UX/spec/checklist lane

Independent scope:

- преобразовать UX/UI spec в exact runtime acceptance criteria;
- описать expected states: populated registry, empty registry, scope tabs, metrics row, filters row, AI row, warning row, table, export controls;
- описать forbidden visual regressions;
- подготовить Agent 4 review checklist;
- писать reports на русском;
- создать `WORKER_3_DONE`;
- при блокировке создать `EXEC_PART_2_BLOCKED.md`.

Required reports:

- `WORKER_3_REPORT.md`
- `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md`
- `FORBIDDEN_VISUAL_PATTERNS.md`
- `EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md`
- `TABLE_VISUAL_EXPECTATIONS.md`
- `NO_FAKE_DATA_AND_SCOPE_SAFETY.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `WORKER_3_DONE`

## 10. Agent 4 runtime gates

Agent 4 / Reviewer выполняет final validation only:

- дождаться `WORKER_2_DONE` и `WORKER_3_DONE`;
- собрать fresh runtime proof на `http://clearvestnic.ru:5180`;
- проверить `/build-info.json`, version marker/build info и соответствие contour/commit/worktree;
- открыть `Реестр действий с продуктом`;
- доказать 5 planes: code, workspace, DB, env/compose, serving mode;
- проверить отсутствие Analytics Hub dependency;
- проверить one unified container, header hierarchy, compact text metrics, filter row, AI row without gradient, warning row without aggressive banner styling, table as main object, status badges as only strong colors;
- проверить CSV/XLSX только один раз в header;
- проверить empty и populated states;
- проверить console errors и unsafe network methods;
- не выдавать `REVIEW_PASS`, если runtime visual review не проходит или `intended != served`.

## 11. Branch hygiene guard

Текущий checkout dirty и не является безопасным местом для product-code edits.

Worker 2 обязан до edits:

- либо создать/use clean worktree от `origin/main`;
- либо письменно доказать, почему текущий checkout безопасен для bounded registry UI changes;
- зафиксировать `pwd`, branch, `HEAD`, `origin/main`, `status`, staged/untracked/diff names;
- не смешивать unrelated changes;
- при невозможности безопасной изоляции создать `EXEC_PART_1_BLOCKED.md`.

## 12. Acceptance criteria

- Страница выглядит как чистая native ProcessMap working page.
- Нет восстановления Analytics Hub, Analytics cards или Properties Registry.
- Все содержимое реестра под app shell в одном белом контейнере.
- Внутри контейнера только typography, spacing и separators, без cards/shadows/gradients.
- Metrics text-only; filters compact; AI row не выглядит banner; warning row soft.
- Table визуально доминирует и читается как рабочий инструмент.
- Existing data flow, export controls, AI control semantics, empty/populated states сохранены.
- No backend/schema/BPMN/RAG/runtime behavior changes.

## 13. Planning validation

- Parallel prompts разделены независимо.
- Блокировки part-specific: `EXEC_PART_1_BLOCKED.md`, `EXEC_PART_2_BLOCKED.md`.
- Only Agent 4 waits for both worker markers.
- `AGENT_RUN_ID` должен содержать точно `20260518T110633Z-57765`.

