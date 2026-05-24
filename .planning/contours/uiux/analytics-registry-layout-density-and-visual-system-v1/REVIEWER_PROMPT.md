# Agent 4 / Reviewer Prompt

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`  
Run ID: `20260518T085529Z-44650`  
Роль: Agent 4 / Reviewer  
Все отчеты писать на русском.

## Перед стартом review

Ждать оба marker-файла:

- `WORKER_2_DONE`
- `WORKER_3_DONE`

Если есть `EXEC_PART_1_BLOCKED.md` или `EXEC_PART_2_BLOCKED.md`, не выдавать `REVIEW_PASS`; создать `REVIEW_BLOCKED.md`.

## Обязательная source/runtime truth

Зафиксировать:

- `pwd`
- `git remote -v` без credential-bearing URL в отчете
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`

## Runtime proof на 5180

- Проверить `curl -I http://clearvestnic.ru:5180`.
- Проверить no-cache headers.
- Проверить `/build-info.json` или runtime build info в браузере.
- Убедиться, что served contour id соответствует этому contour.
- Проверить, какой worktree реально served.

## Browser review

В fresh authenticated browser context:

- открыть Analytics Hub;
- открыть Product Actions Registry;
- проверить wide-screen viewport, желательно 1920x1080 и минимум 1280px ширину;
- сделать screenshots/evidence для Hub, populated project registry, empty workspace registry;
- проверить, что page больше не выглядит как narrow centered technical panel;
- проверить, что table является dominant object;
- проверить hierarchy: header/navigation -> scope -> metrics -> filters/actions -> warning -> table -> pagination -> sources;
- проверить selected state и readability scope selector;
- проверить compact useful metrics rhythm;
- проверить visible structured filters/actions;
- проверить, что AI controls остаются перед table;
- проверить, что CSV/XLSX compact utility actions;
- проверить, что sources section secondary и separated;
- проверить populated project scope;
- проверить empty workspace scope без fake data;
- проверить console clean during viewing/navigation;
- проверить network: нет unsafe `PUT`, `PATCH`, `DELETE` от navigation/viewing.

## Non-goal regression gates

Подтвердить, что не менялись:

- global shell/header/sidebar redesign;
- backend/schema;
- BPMN XML;
- Product Actions durable truth;
- RAG runtime;
- AI behavior;
- package install/package lock;
- Diagram performance code.

## Verdict rules

Создать `REVIEW_PASS` только если runtime visual review действительно проходит и все gates закрыты.

Если визуально экран все еще выглядит как маленькая панель в пустом canvas, если table не доминирует, если hierarchy серая/плоская, если build/runtime не соответствует contour, или если обнаружены unsafe mutations/backend/schema/RAG изменения, создать `CHANGES_REQUESTED`.

## Required outputs

- `REVIEW_REPORT.md`
- `RUNTIME_VISUAL_EVIDENCE.md`
- `RUNTIME_PROOF_CHECKLIST_FILLED.md`
- `REVIEW_PASS` или `CHANGES_REQUESTED` / `REVIEW_BLOCKED`

