# PR — S7: undo/redo полнота (compensating create + post-undo inverse + :470 drift-фикс)

> Контур: `feature/mutation-gateway-c3`, срез S7 (PLAN.md §7). Base: S6 (`60967931`, VERIFIED).
> Merge/PR — только по explicit approve владельца.

## Что

1. **Undo-of-delete → compensating create-op с сохранением id** (контракт step2, opId-идемпотентность applied_ops). Ключевая находка: bpmn-js фаерит undo-delete верхним событием `id.updateClaim` с пустым дескриптором — runtime-enrichment доснимает post-undo live-ref из elementRegistry (bounds/type/parentId/endpoints/text); redo → delete-op. `snapshotElementRef`: +parentId/endpoints/text. Backend: recreate textAnnotation с text-payload → `<bpmn:text>`. **Fail-closed**: битый снапшот/cold-типы → needsFullSave с причиной.
2. **Undo spaceTool / text-edit аннотации**: inverse по post-undo live-снапшоту (на undo-changed bounds/waypoints уже восстановлены): -delta move + absolute resize + updateDi.
3. **Reconnect**: снапшот newSource/newTarget (+old*) — контекст больше не теряется.
4. **:470 drift-фикс**: documentation-as-string (спека) — S5 принимал только moddle-массив → 2/20 needsFullSave. String → rows. **Спека :470: 20/20=1.00, putBpmn=0 — PASS.**
5. **Undo coalesced**: needsFullSave сохранён (слипшаяся op не восстанавливает промежуточные дельты — честный fallback, задокументировано).
6. **Класс C — cold с обновлённой причиной** (условие 3, parity не форсировался): ops-перевод требует порта preserve/rebuild-семантики camunda-extensions в applier (риск #995).

## e2e undo/redo-матрица (8 мапперов, S0-методика, изолированный стек)

move / resize / create / delete(+golden recreate, тот же id) / reconnect / label / spaceTool / elements.move — каждая: do→undo→redo, **0 PUT /bpmn**, ≥1 POST /operations на фазу, reload → server truth (API XML). **Все PASS** (`evidence/s7/logs/s7-e2e-undo-matrix.jsonl`).

## :470 pinpoint (вход S8 — закрыт в S7)

Дрейф был вызван **documentation-as-string** в 2 правках спеки (S5-регрессия маппера), НЕ lane.updaterefs (probe: lane create/connect/delete маппятся 4/4). Фикс в S7 → спека 20/20 зелёная. S8: ре-базелина не требуется.

## Метрика путей: 1+1+X (X=3)

**X3 (undo-of-delete) закрыт** — compensating create parity. Остаются: X1 participant (cold навсегда), X2 класс C (cold: порт preserve/rebuild-семантики + golden-цикл, отдельная волна), X4 lane.updaterefs/data-ассоциации (needsFullSave, вокабуларая матрица §8).

## Дата смерти

**`fpc_gateway_cold_fallback` = 2026-10-03** (исполнена в S6 удалением degrade-веток; флаг был kill-switch уровня планирования, в коде не заложен — grep-доказательство в EXEC_REPORT_S6).

## Тест-матрица

backend 58+3 subtests; save-зоны 562/563 (hang pre-existing); commandToOps 69/69; полный сьют — 0 новых падений vs S6; e2e-матрица PASS; :470 PASS.

## Rollback

1. Revert `740b8987` — undo-пути возвращаются в needsFullSave-fallback'и (X3 восстановится как исключение).
2. Оперативно: `localStorage.fpc_gateway_lane="0"`.

## Риски

- id.updateClaim-enrichment зависит от elementRegistry на undo-changed (элемент восстановлен) — fail-closed при отсутствии.
- redo-id.updateClaim → delete-op: корректен только в delete-контексте (других top-level claim-событий не наблюдается; execute-путь — needsFullSave).
