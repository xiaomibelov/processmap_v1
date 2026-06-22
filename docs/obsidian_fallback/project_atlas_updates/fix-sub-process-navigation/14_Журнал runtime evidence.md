---
title: "14 Журнал runtime evidence"
type: project-atlas-update
contour: fix/sub-process-navigation
date: 2026-06-15
status: source-tested
---

## 2026-06-15 - fix/sub-process-navigation

| Поле | Значение |
| ---- | -------- |
| source | `new-origin/main` |
| branch | `fix/sub-process-navigation` |
| head | `e6127144` |
| deployed commit | `e6127144` |
| test stand | http://clearvestnic.ru:5177 |
| verdict | `SOURCE_TESTED` |

> [!summary] Before
> Drill-down в подпроцесс работал, но при появлении breadcrumb-строки BPMN-канвас схлопывался и под верхним хэдером появлялось пустое пространство. Legacy CSS `.processShell { height: calc(100vh - 56px - 38px); }` не учитывал динамическую высоту `.appTopStack`.

> [!success] After source proof
> TopBar, баннер обновлений и уведомления обёрнуты в `.appTopStack`; `.appRoot` использует `grid-rows-[auto_minmax(0,1fr)_auto]`; `.processShell` больше не имеет фиксированной высоты. Canvas занимает всё оставшееся пространство при появлении breadcrumbs.
> Одиночный клик по телу `CallActivity`/`SubProcess` больше не вызывает drill-down; навигация происходит только по клику на overlay-иконку `.bjs-drilldown`.
> Breadcrumb подпроцесса рендерится внутри рабочей области (over the canvas) как абсолютный overlay с отступами `top: 12px; left: 12px` и не прилипает к верхнему хедеру.

Tests:

| Command | Result |
| ------- | ------ |
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS, `✓ built in 23.19s` |
| `node scripts/e2e/check_subprocess_click.mjs` | PASS |

Runtime proof:

> [!success] STAGE_PROOF_OK
> Deploy `e6127144` поднят на http://clearvestnic.ru:5177; E2E-сценарий проверяет, что одиночный клик по `CallActivity`/`SubProcess` не ведёт в drill-down, стрелка `.bjs-drilldown` открывает child-сессию, breadcrumb и кнопка "Назад" возвращают к родителю.
