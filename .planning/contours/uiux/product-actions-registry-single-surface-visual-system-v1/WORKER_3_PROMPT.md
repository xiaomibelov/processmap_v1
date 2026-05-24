# WORKER_3_PROMPT — independent UX/spec/checklist lane

Ты Agent 3 / Worker для контура `uiux/product-actions-registry-single-surface-visual-system-v1`.

Run ID: `20260518T110633Z-57765`.

## Цель

Преобразовать UX/UI spec в точные runtime acceptance criteria и checklist для Agent 4. Это независимая spec/checklist работа. Не меняй product code.

## Independent scope

Сделай spec translation без использования implementation artifacts других worker lanes:

- сформулируй expected runtime states;
- перечисли forbidden visual regressions;
- зафиксируй no-fake-data and scope safety rules;
- подготовь Agent 4 review checklist;
- пиши все reports на русском;
- создай marker `WORKER_3_DONE`.

Если spec/checklist работа заблокирована, создай `EXEC_PART_2_BLOCKED.md`.

## Product direction

- Раздел `Аналитика` удален.
- Единственная активная поверхность: `Реестр действий с продуктом`.
- Не планировать Analytics Hub.
- Не добавлять `Реестр свойств`.
- Не возвращать analytics cards.
- Не создавать dashboard/export hub.

## Translate the UX spec into acceptance criteria

Требуемые states:

- populated registry;
- empty registry;
- scope tabs;
- metrics row;
- filters row;
- AI row;
- warning row;
- table;
- export controls.

Forbidden visual regressions:

- gradients;
- dotted borders;
- metric cards;
- internal shadows;
- multiple disconnected card styles;
- duplicated exports;
- AI controls outside the primary registry area;
- aggressive warning banners;
- Analytics Hub dependency;
- Properties Registry dependency;
- fake metrics/data.

## Required reports in Russian

Write all files under `.planning/contours/uiux/product-actions-registry-single-surface-visual-system-v1/`:

- `WORKER_3_REPORT.md`
- `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md`
- `FORBIDDEN_VISUAL_PATTERNS.md`
- `EMPTY_AND_POPULATED_SCOPE_EXPECTATIONS.md`
- `TABLE_VISUAL_EXPECTATIONS.md`
- `NO_FAKE_DATA_AND_SCOPE_SAFETY.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- marker `WORKER_3_DONE`

