# Agent 4 Runtime Review Prep

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`

## До browser review

Agent 4 должен дождаться обоих markers:

- `WORKER_2_DONE`
- `WORKER_3_DONE`

Затем выполнить fresh truth proof:

- `pwd`
- `git remote -v` с redaction credential-bearing URL
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`

## Runtime identity gate

Перед визуальным verdict проверить:

- `http://clearvestnic.ru:5180` отвечает `200`.
- `/build-info.json` содержит этот `contourId`: `uiux/analytics-registry-layout-density-and-visual-system-v1`.
- `branch`, `sha`, `dirty`, `sourceWorktree` объясняют, какой checkout реально served.
- Если `dirty=true`, должен быть explicit accepted exception; иначе `REVIEW_PASS` запрещен.

## Browser setup

- Использовать fresh authenticated browser context.
- Проверять wide desktop viewport минимум `1280x900`; желательно дополнительный `1440x900` или `1920x1080`.
- Сделать screenshots:
  - Analytics Hub wide screen;
  - Registry populated project scope;
  - Registry empty workspace scope;
  - Registry после scroll до sources, если sources не видны в первом экране.
- Включить console и network capture.

## Required navigation/state checks

1. Открыть Analytics Hub как top-level surface.
2. Перейти в Product Actions Registry через Hub action.
3. Открыть direct registry route для populated project.
4. Проверить workspace/project/session scope states.
5. Проверить empty workspace state на real empty workspace или accepted fixture. Synthetic nonexistent workspace с `404` в console не является clean proof.
6. Проверить, что navigation/viewing не отправляет unsafe `PUT`, `PATCH`, `DELETE`.

## Visual gates

Применить `EXPECTED_VISUAL_STATES.md` и `NOT_SMALL_PASTED_PANEL_RUBRIC.md`.

Pass возможен только если одновременно доказано:

- Hub использует workspace width и не выглядит как маленькая centered card.
- Registry wrapper использует большую часть available workspace width.
- Table является самым сильным рабочим объектом страницы.
- Scope selector readable, selected state очевиден, context values полезны.
- Metrics compact and supportive, не конкурируют с table.
- Filters/actions находятся до table и читаются как primary controls.
- CSV/XLSX compact utilities; AI controls не перенесены в sources.
- Sources section secondary and separated after table/pagination.
- Global shell/header/sidebar визуально не редизайнены.

## Reject conditions

Agent 4 должен выставить `CHANGES_REQUESTED`, если наблюдается хотя бы одно:

- Нельзя доказать commit/branch, содержащий fix.
- Runtime served не соответствует expected contour/build.
- Контент выглядит narrow-centered: main surface заметно уже workspace area, вокруг доминирует blank space.
- Header, scope, metrics, filters, table и sources выглядят как один ряд одинаковых серых блоков.
- Table не доминирует или pagination detached from table.
- Scope block показывает misleading missing context.
- Empty state разрушает page structure, заменяет table целиком message-only block или показывает fake rows.
- Browser console содержит runtime errors during normal viewing.
- Network содержит unsafe mutation requests during viewing/navigation.
- Diff включает backend/schema/BPMN/RAG/AI/global shell redesign/package changes без прямого approval.

