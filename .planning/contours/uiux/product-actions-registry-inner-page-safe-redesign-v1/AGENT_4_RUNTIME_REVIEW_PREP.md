# AGENT_4_RUNTIME_REVIEW_PREP

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T144447Z-92350`  
**Назначение:** pass/fail checklist для финального runtime review после Worker 2 + Worker 3.

## Preflight

- [ ] `WORKER_2_DONE` существует.
- [ ] `WORKER_3_DONE` существует.
- [ ] Зафиксированы `pwd`, branch, `HEAD`, `origin/main`, `status`, `diffstat`.
- [ ] Runtime открыт свежим browser context на `http://clearvestnic.ru:5180`.
- [ ] `build-info.json` и visible/app version соответствуют served build.
- [ ] Открыт exact flow: Analytics -> `Реестр действий`.

## Empty workspace scope

PASS только если видны:

- [ ] title `Реестр действий с продуктом`;
- [ ] description/subcopy;
- [ ] scope tabs `Workspace / Проект / Сессия`;
- [ ] compact metrics row;
- [ ] filters/actions row;
- [ ] AI controls in primary area;
- [ ] table headers или deliberate empty-state table shell;
- [ ] clear empty-state message.

FAIL если empty workspace выглядит как blank/broken registry или прячет table shell/AI controls.

## Populated project scope

PASS только если:

- [ ] rows видны;
- [ ] table остается primary content;
- [ ] filters/warning/pagination относятся к table;
- [ ] CSV/XLSX выглядят как compact utility actions;
- [ ] `Вернуться` читается как navigation action;
- [ ] AI controls находятся до secondary source section;
- [ ] `Источники данных` отделены и вторичны.

FAIL если AI controls находятся ниже pagination или внутри `Источники данных`.

## Data and mutation safety

- [ ] Нет fake/mock/random registry rows.
- [ ] Export endpoints ожидаемые и связаны с backend registry export.
- [ ] Navigation/filtering/viewing не вызывает unsafe `PUT`, `PATCH`, `DELETE`.
- [ ] BPMN XML не мутируется.
- [ ] Product Actions durable truth не переносится из `interview.analysis.product_actions[]`.

## Hygiene gate

- [ ] Dirty workspace classification присутствует и actionable.
- [ ] Registry/analytics changes отделены от unrelated BPMN/runtime/tooling changes.
- [ ] Reviewer явно пишет, является ли текущий checkout merge-ready.

No `REVIEW_PASS`, если hygiene остается unclassified или используется source-only proof без fresh runtime.
