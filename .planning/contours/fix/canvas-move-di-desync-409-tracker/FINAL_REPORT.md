# FINAL REPORT — fix/canvas-move-di-desync-409-tracker

Дата: 2026-09-21. Статус: **CONTOUR READY FOR REVIEW** (merge/deploy — только по explicit approve владельца).

## git-proof

- Ветка: `fix/canvas-move-di-desync-409-tracker`, от `origin/main @ 90556bae` (#1005 C3 + #1007).
- HEAD: `230a4948` (pushed в origin). 5 коммитов: docs PLAN-гейт + S1–S4.
- Diffstat vs main: 38 файлов, +2828/−149; **backend-diff: 0 строк**.

## Что закрыто (4/4 находки аудита)

| Срез | Находка | Коммит | Суть |
|------|---------|--------|------|
| S1 | F1/F2 (DI-desync drag/resize) | `abd2546b` | enrichment affectedConnections для shape.move/shape.resize (positionalSnapshot.js), мапперы допускают updateDi-батч, undo-паритет. **Бонус: латентный баг C3-S3** — pushCommand брал только ops[0], updateDi-хвост батча терялся для elements.move/spaceTool с момента C3; outbox теперь пушит весь батч. |
| S2 | F5 (ложный 409) | `24ece1c8` | собственный ops-ack adopt'ит ack-версию в casVersionTracker (монотонный guard, идемпотентно). Артефакт WHY_NO_CROSS_TAB_HEAL.md: heal физически невозможен в одиночной вкладке (входящие adopt только от другого clientId); вариант B не нужен, допустим строго как fallback по live-evidence — отдельным approve. |
| S3 | Модал 409 «?/?» | `f77fa4b2` | канонические reader'ы версий/changed_keys для всех форм 409 (PUT /bpmn, PATCH /sessions, POST /operations); hybrid-ветка передаёт clientBase из трекера на момент отправки; «?» только при реальном отсутствии данных. |
| S4 | F3 (DI-edge после reconnect) | `230a4948` | companion element.updateDi в mapConnectionReconnect (waypoints из снапшота, undo — post-undo captured); без waypoints — reconnect only (by design §5.4); strictIdOf fail-closed. |

## Доказательства

- Unit: RED подтверждён на каждом срезе; GREEN — mapper 84/84, opsOutbox 173/173, positionalSnapshot, session/hybrid зоны; полный `npm test` фейл-сет **идентичен baseline main** (26 pre-existing: appVersion drift, i18n, dark-theme, presence flaky; hang saveBpmnState.property-pipeline — pre-existing, не чинился).
- e2e (локальный стек ветки, реальная мышь, S0-методика, креды env-импортом):
  - single drag с инцидентными стрелками → server truth docked до restore, payload [shape.move, updateDi×2], putCount=0 — PASS;
  - resize-down → docked, [shape.resize, updateDi×2], putCount=0 — PASS;
  - reconnect → DI-endWp на грани нового endpoint, идентично после reload, putCount=0 — PASS.
- Метрика путей записи: **1+1+X без изменений** (backend-diff 0, новых op-типов/флагов/PUT-путей нет — grep-доказательство в PR_S1–S4).

## Ограничения и риски

- Канбан-порт параметризован `${KANBOARD_PORT:-3001}` (параллельные стеки; дефолт прежний) — задокументировано в PR_S1.
- Опечатка «outox» в сообщении коммита S1 — косметика, amend не делался (ветка запушена).
- Вариант B (defense-in-depth на syncStateStore) — НЕ реализован; решение по WHY_NO_CROSS_TAB_HEAL.md: только если live-409 после stage-деплоя, отдельным approve.

## Что дальше (за владельцем)

1. Review → merge по approve → stage-деплой (release-контур, CI workflow).
2. Рестарт soak-часов audit/c3-stage-soak-24h на исправленном билде (+ battery: di-docking-after-mutations; ops-then-cold-save-no-409 уже в батарее).
3. Текущее soak-окно досматривается до +24h (финал 01:35 MSK 22.09), но prod C3 им НЕ разблокируется.
4. Prod-деплой C3+фикс — только после чистых 24ч soak на новом билде и explicit approve.
