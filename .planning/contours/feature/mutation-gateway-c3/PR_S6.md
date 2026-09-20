# PR — S6: degrade-замена (ни одной молчаливой деградации) + аудит прямых PUT

> Контур: `feature/mutation-gateway-c3`, срез S6 (PLAN.md §7). Base: S5 (`6dfa51b5`, VERIFIED).
> Merge/PR — только по explicit approve владельца.

## Что

**Degrade-замена.** Все 9 degrade-веток переклассифицированы (инвентаризация с file:line — EXEC_REPORT_S6):
- conflict-семейство (double-409, rebase-no-server-xml, reload-failed, rebase-failed, rebase-error) → **conflictStop**: C2 conflict gate остаётся armed → **честный модал**; статус `ops-conflict`; буфер ops pending (journal-durable); **0 silent full-PUT**.
- 422 operation-unsupported → **inlineStop**: `ops-unsupported` с explicit reason; op pending (undo доступен); 0 full-PUT.
- transport-failed → **inlineStop**: `ops-error`; bounded backoff-retry (1s→8s, сброс по ack).
- offline-suppressed → без изменений (ops-local индикатор, durable).
- fuzzy-fail→fetch+rebase: успех → silent-rebase (C2) сохранён; провал → conflictStop.
- needsFullSave → explicit cold-путь (не degrade): не-whitelisted команды объявленным полным сохранением.

`degrade()` удалён как класс (минус-код). `fpc_gateway_cold_fallback` в коде никогда не существовал (grep 0) — смерть флага исполнена удалением охраняемых веток; **дата смерти 2026-10-03**.

**Аудит прямых PUT.** Полный список (grep, EXEC_REPORT_S6): все сайты — либо lane-участники (gatewayPut/system cold §9: tobe_publish, snapshot restore, conflict replay/overwrite, merge-panel, dead_session_restore, save_all), либо внутри lane-пайплайнов (xml/rawXml transport, класс C property), либо документированное исключение (keepalive-unload). **PUT вне lane/вне cold-действий: 0.**

## e2e-регресс save-контура (изолированный стек ветки)

| Сценарий | Результат |
|---|---|
| undo/redo-цикл (0 PUT, reload) | PASS |
| same-tab 409 → silent-rebase без модала (C2) | PASS |
| spaceTool → ops | PASS |
| kill-tab → IDB redelivery | PASS |
| offline → sync on reconnect | PASS |
| reload mid-series → exactly-once | PASS |
| coverage :470 | FAIL 18/20 — **pre-existing drift** (идентично на S5-коде; lane-фикстура спеки; ре-базелина — S8) |

## Метрика путей: **1+1+X** (X=4)

1 интерактивный канал (ops via gateway-lane) + 1 cold-канал (system PUT via lane) + **X**: participant (cold навсегда, S4), класс C property (cold до S7+, #995), undo-of-delete (needsFullSave до S7), lane.updaterefs/data-ассоциации (needsFullSave, вокабуларая матрица §8). Каждое X — с причиной и срезом-смерти.

## Дата смерти

**`fpc_gateway_cold_fallback` = 2026-10-03** — исполнена удалением degrade-веток (флаг был kill-switch уровня планирования, в коде не заложен; доказательство grep в EXEC_REPORT_S6).

## Тест-матрица

backend 58+3 subtests; frontend save-зоны 553/554 (hang pre-existing); полный сьют 4002 — **0 новых падений**; opsOutbox 163/163; e2e-регресс 6/7 (1 pre-existing drift с доказательством).

## Rollback

1. Revert `ee044305` — degrade-ветки возвращаются (silent full-PUT востановится; откат целенаправленный).
2. Оперативно: `localStorage.fpc_gateway_lane="0"`.

## Риски

- transport-failed теперь полагается на backoff-retry + durable journal (раньше спасал silent full-PUT) — буфер не теряется при kill-tab (спека persistence:285 PASS).
- 422 держит op в голове буфера до undo — by design (inline-оповещение), потерь нет.
