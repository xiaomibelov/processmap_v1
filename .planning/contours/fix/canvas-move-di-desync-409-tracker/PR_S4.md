# PR — S4 (fix/canvas-move-di-desync-409-tracker)

**Срез:** S4 — F3: companion `element.updateDi` в `mapConnectionReconnect`.
**Ветка:** `fix/canvas-move-di-desync-409-tracker` (baseline `origin/main @
90556bae`, поверх S1 `abd2546b`, S2 `24ece1c8`, S3 `f77fa4b2`).
**Статус:** готово к review. PUSH в origin НЕ выполнялся.

## Проблема

Backend `_apply_connection_reconnect` намеренно не мигрирует DI-edge
(API.md §5.4): reconnect менял source/target в семантике, но серверный XML
сохранял старые waypoints на старые endpoints → стрелка визуально растянута
до следующего полного сохранения (аудит canvas-move-di-desync-422).

## Изменение

`mapConnectionReconnect` дополнительно эмитит `element.updateDi` с waypoints
из снапшотного ref (post-action; post-undo captured — S7-parity):

- порядок батча: `connection.reconnect` → `element.updateDi`;
- waypoints отсутствуют → reconnect без updateDi (by design);
- fail-closed: `strictIdOf` (не-строковый id → needsFullSave), битые
  waypoints → needsFullSave.

Backend untouched; новых op-типов нет (`element.updateDi` существует).

## Тесты (RED подтверждён)

4 новых unit: companion+порядок; undo-паритет (captured waypoints как есть);
«без waypoints → reconnect only» (by-design характеризация); fail-closed
(id/waypoints). GREEN: commandToOps 84/84, opsOutbox 173/173, полный npm
test — фейл-сет идентичен baseline.

## E2E (локальный стек ветки, реальная мышь)

Reconnect F_2 (Task_A→Task_B) на Task_C: payload
`["connection.reconnect","element.updateDi"]`, server truth ДО restore:
F_2 target=Task_C, DI-endWp (540,400) на грани Task_C; после reload —
идентично; putCount=0 (ops-only). VERDICT pass=true.

## Риски

- Семантика absolute waypoints совпадает с battle-tested путями (S3/S1).
- Откат: revert одного коммита → поведение = main (с известным F3).

## Статус контура

S1–S4 DONE. Далее: review-гейт владельца, push (оркестратор), stage-деплой +
рестарт soak-окна по approve (release-контур), battery +2 сценария
(`di-docking-after-mutations`).
