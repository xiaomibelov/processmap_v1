# AGENT4_REVIEW_CHECKLIST

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Runtime identity

- [ ] `curl -I http://clearvestnic.ru:5180` returns HTTP 200.
- [ ] no-cache headers checked.
- [ ] `curl -sS http://clearvestnic.ru:8088/health` returns healthy response.
- [ ] `/build-info.json` captured.
- [ ] served branch/sha/worktree/run id explained.
- [ ] served source matches this contour or mismatch is documented as BLOCKED/CHANGES_REQUESTED.

## Analytics navigation

- [ ] Fresh browser context.
- [ ] Open ProcessMap runtime.
- [ ] Open `Аналитика`.
- [ ] Top-level `Аналитика` exists and was not replaced by registry page.
- [ ] Module `Реестр действий` is visible.
- [ ] Module `Реестр свойств` is visible.
- [ ] Module `Дашборды` is visible.
- [ ] No separate Analytics module `Экспорт` is visible for this contour.

## Properties Registry page

- [ ] Open `Реестр свойств`.
- [ ] Title is `Реестр свойств`.
- [ ] Subtitle is `Сводный список свойств BPMN-элементов и процессных объектов.`
- [ ] `Вернуться` is visible.
- [ ] `Вернуться` returns to Analytics.
- [ ] Scope selector has `Workspace`, `Проект`, `Сессия`.
- [ ] Metrics row has `Источников`, `Элементов`, `Свойств`, `Типов свойств`, `После фильтров`.
- [ ] Filters are present only if backed by real data.
- [ ] Table or foundation empty state is present.
- [ ] Source truth note is visible.

## Real-data mode gate

If rows are shown:

- [ ] each row source is documented in implementation/report artifacts;
- [ ] no fake sample rows;
- [ ] no fake counts;
- [ ] row fields map to real source paths;
- [ ] metrics formulas match actual row set;
- [ ] filters map to actual fields;
- [ ] source is not Product Actions data;
- [ ] source is not RAG output;
- [ ] source is not merely planned text.

## Foundation mode gate

If no safe real rows are shown:

- [ ] required empty message is visible:

```text
Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.
```

- [ ] unavailable metrics use `—`.
- [ ] planned groups are clearly marked planned text.
- [ ] no rows/counts/options imply extracted current data.

## Safety/network

- [ ] Browser console has no blocking errors.
- [ ] No unsafe `PUT/PATCH/DELETE` happens from viewing/navigation/filtering.
- [ ] No BPMN XML mutation.
- [ ] No Product Actions durable truth mutation.
- [ ] No backend/schema changes in diff.
- [ ] No RAG runtime implementation in diff.

## Regression checks

- [ ] `Реестр действий` still opens.
- [ ] Product Actions registry export controls remain inside that registry, not as top-level Analytics module.
- [ ] Global shell/header/sidebar unchanged.
- [ ] Page uses one main white container with light separators; no gradients/dotted borders/nested cards/colored metric cards.

## Reviewer verdict rules

Set `CHANGES_REQUESTED` if:

- `Аналитика` is missing or replaced;
- `Реестр свойств` cannot open;
- fake property rows/counts/options appear;
- real row source is undocumented;
- Product Actions data is used as properties source;
- viewing/filtering writes BPMN XML or Product Actions;
- served runtime identity does not match contour and is not explained.
