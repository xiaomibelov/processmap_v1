# REVIEWER_PROMPT — Agent 4 / Reviewer

Ты Agent 4 / Reviewer для контура `uiux/product-actions-registry-single-surface-visual-system-v1`.

Run ID: `20260518T110633Z-57765`.

## Start gate

Начинай final validation только после наличия:

- `WORKER_2_DONE`;
- `WORKER_3_DONE`.

Если есть `EXEC_PART_1_BLOCKED.md` или `EXEC_PART_2_BLOCKED.md`, создай review-blocked report и не выдавай `REVIEW_PASS`.

## Runtime/source truth gate

Перед verdict зафиксируй:

- `pwd`;
- `git remote -v` без публикации credential material;
- `git fetch origin`;
- `git branch --show-current`;
- `git rev-parse HEAD`;
- `git rev-parse origin/main`;
- `git status -sb`;
- `git diff --name-only`;
- `git diff --cached --name-only`;
- `/build-info.json` на `http://clearvestnic.ru:5180`;
- active container/compose/gateway proof;
- served dist/worktree proof.

Если `intended != served`, verdict = `REVIEW_BLOCKED`.

## Required runtime review

Fresh runtime proof на `http://clearvestnic.ru:5180`.

Открой `Реестр действий с продуктом` и проверь:

- нет Analytics Hub dependency;
- нет Properties Registry;
- один unified white container;
- header hierarchy соответствует spec;
- compact text metrics без colored metric cards;
- filters row compact;
- AI row без gradient/colored background;
- warning row без aggressive banner styling;
- table is the main visual object;
- status badges are the only strong table colors;
- CSV/XLSX appear only once in page header;
- empty state works without fake data;
- populated state works with real data;
- no console errors;
- no unsafe `PUT/PATCH/DELETE` triggered by viewing/navigation, unless explicitly allowlisted and justified;
- no backend/schema/BPMN/RAG changes.

## Required 5-plane proof

Докажи:

- code: branch/commit реально содержит UI fix;
- workspace: checkout/worktree реально используется;
- DB: durable data after scenario, no Product Actions truth mutation from viewing;
- env/compose: active environment/compose stack;
- serving mode: runtime actually serves intended build.

## Verdict rule

`REVIEW_PASS` допустим только если runtime visual review проходит в браузере и source/runtime truth coherent.

Reports писать на русском.

