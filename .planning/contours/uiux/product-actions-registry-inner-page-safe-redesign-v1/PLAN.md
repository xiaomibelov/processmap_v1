# PLAN: empty scope and AI controls rework

Контур: `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
Run: `20260517T144447Z-92350`  
Статус: `READY_FOR_EXECUTION` поверх актуального `CHANGES_REQUESTED`

## Текущая причина `CHANGES_REQUESTED`

Agent 4 доказал, что runtime `:5180` отдавал `v1.0.136` с `build-info.json sha=5b20bc2`, console был clean, exports/filter/pagination работали в project context, unsafe `PUT/PATCH/DELETE` не наблюдались.

Но review не может быть `REVIEW_PASS`, потому что:

- empty workspace scope может выглядеть как сломанная пустая registry page;
- AI controls в populated project scope находятся в secondary sources section, а не в primary filters/actions area;
- dirty workspace и non-canonical checkout context остаются merge/release blocker до классификации.

## Цель rework

Сохранить понятную первичную структуру registry в empty и populated состояниях:

- title/description;
- scope tabs;
- compact metrics;
- filters/actions;
- AI controls;
- warning/empty state;
- table shell with headers или deliberate empty-state;
- pagination when rows exist.

Secondary `Источники данных` section должна оставаться отдельной и не содержать main AI controls.

## Work split

### Agent 2 / Worker

UI implementation only:

- fix empty workspace scope rendering;
- keep table headers or deliberate empty-state table shell visible;
- keep filters/actions visible;
- place AI controls in primary filters/actions area;
- remove AI controls from source/session section;
- keep CSV/XLSX compact;
- preserve shell, Analytics Hub, data flow;
- update version row if product code changes.

Prompt: `WORKER_2_REWORK_PROMPT.md` and compatibility `EXECUTOR_PART_1_PROMPT.md`.

### Agent 3 / Worker

Independent UX/spec + hygiene lane:

- define acceptance criteria;
- classify dirty workspace into Analytics Hub pre-existing, Registry redesign, current rework, unrelated/unsafe;
- prepare Agent 4 runtime review checklist;
- write Russian reports.

Prompt: `WORKER_3_REWORK_PROMPT.md` and compatibility `EXECUTOR_PART_2_PROMPT.md`.

### Agent 4 / Reviewer

Final validation only:

- fresh `:5180` runtime proof;
- version/build-info match;
- exact `Analytics -> Реестр действий` path;
- empty workspace scope UX proof;
- populated project scope UX proof;
- console/network mutation proof;
- actionable branch hygiene proof.

Prompt: `REVIEWER_REWORK_PROMPT.md` and compatibility `REVIEWER_PROMPT.md`.

## Non-goals

- app shell/header/sidebar redesign;
- Analytics Hub redesign;
- backend/schema/Product Actions durable truth/BPMN/RAG changes;
- package install;
- fake data;
- broad refactor;
- unrelated Diagram/Product Actions AI work.

## Validation before execution

- Worker prompts are independent.
- Worker 3 prompt does not contain dependent validation language.
- Only reviewer prompt waits for both worker markers.
- Blocked markers are part-specific: `EXEC_PART_1_BLOCKED.md`, `EXEC_PART_2_BLOCKED.md`.
- `CHANGES_REQUESTED` exists.
