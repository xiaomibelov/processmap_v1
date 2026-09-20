# EXEC_REPORT — S6 (degrade-замена + аудит PUT + cold-fallback) контура feature/mutation-gateway-c3

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S6 по PLAN.md §7.
Статус: **DONE** (push после среза; PR не создавался).

## Инвентаризация 9 degrade-веток → судьба каждой

| # | Ветка | file:line (до S6) | Судьба |
|---|---|---|---|
| 1 | double-409 | `createSaveOutbox.js:724` (degrade) | **conflictStop** — gate armed (C2) остаётся → honest modal; status `ops-conflict`; буфер pending; 0 full-PUT |
| 2 | rebase-no-server-xml | `:742` | **conflictStop** (аналогично) |
| 3 | reload-failed | `:748` | **conflictStop** |
| 4 | rebase-failed (fuzzy miss) | `:759` | **conflictStop** |
| 5 | rebase-error | `:759` | **conflictStop** |
| 6 | operation-unsupported (422) | `:794` (_onError) | **inlineStop** — `ops-unsupported` + explicit reason; op pending (undo доступен); bounded backoff-retry; 0 full-PUT |
| 7 | transport-failed | `:794` | **inlineStop** — `ops-error`; буфер pending; backoff-retry 1s→8s (сброс по ack) |
| 8 | offline-suppressed | `flushNow :393-396` | **без изменений** — `ops-local` индикатор (не degrade, durable IDB) |
| 9 | fuzzy-fail → fetch+rebase | `:757-771` | успех → **silent-rebase (C2, без модала) — сохранено**; провал → conflictStop (вместо full-save) |
| + | needsFullSave (full-save из interactive capture) | `pushCommand :583-587`, `send :498` | **explicit cold-путь (НЕ degrade)**: не-whitelisted команды (lane.updaterefs/participant/класс C и пр.) идут объявленным полным сохранением; класс C property и participant — cold по дизайну (S4/S5) |

`degrade()` как класс удалён (минус-код: −requestFullSave из failure-путей, −съём gate, stage `ops-degraded` вытеснен). UI: новые стадии `ops-conflict` / `ops-unsupported` / `ops-error` (saveStatusSlotModel). **Ни одной молчаливой деградации: interactive-пути не ведут в silent full-PUT** (проверено grep: `requestFullSave` остался только в needsFullSave-делегировании и wiring-опции).

**fpc_gateway_cold_fallback**: в коде НИКОГДА не существовал (grep по frontend/src + backend/app: 0 совпадений; kill-switch уровня планирования PLAN §9). «Смерть флага» исполнена удалением охраняемых веток в коммите `ee044305`; дата смерти 2026-10-03 дублирована в PR_S6.md. Пустая заглушка-коммит не потребовалась — e2e-гейты пройдены.

## Аудит прямых PUT (grep apiPutBpmnXml/gatewayPutBpmnXml, frontend/src)

| Точка | Классификация |
|---|---|
| `gatewayPut.js` (весь файл) | lane-API сам (S1) |
| `ProcessStage.jsx:1679/1752/2669/2754` | **lane-участники** (gatewayPutBpmnXml): dead_session_restore / same_tab_replay / overwrite_conflict / merge-panel keep mine — системные cold §9 |
| `App.jsx:3840` | lane (gatewayPutBpmnXml): tobe_publish — системное cold §9 |
| `useSessionActivationOrchestration.js:392` | lane (gatewayPutBpmnXml): snapshot restore — системное cold §9 |
| `createBpmnPersistence.js:129-133, 207-210` | rawXml-пайплайн transport + reconcile-retry — **внутри lane** |
| `saveBpmnState.js:76-77, 165, 276-291` | xml-пайплайн transport — **внутри lane** |
| `propertySaveBoundary.js:25/51`, `propertyCrudBoundary.js:360` | класс C property full-PUT — **cold по дизайну (S5)**, внутри lane |
| `saveAllBatch.js:16/34` → `App.jsx:1103` | save_all (Ctrl+S) — системное cold §9, внутри lane |
| `bpmnWiring.js:187`, `BpmnStage.jsx:1556`, прочие import/deps-строки | проброс в пайплайны, не самостоятельные сайты |

Keepalive-unload flush — вне lane (page-exit best-effort, документированное исключение S1). **Прямых PUT вне lane / вне документированных cold-действий: 0.**

## e2e-регресс save-контура (изолированный стек wt-mgc3-s6: API 28011, frontend 25177, vite 25178)

| Сценарий | Источник | Результат |
|---|---|---|
| undo/redo-цикл (rename→undo→redo, reload) | `evidence/s6/s6-e2e-undo-redo.mjs` | **PASS** (0 PUT, 3 ops-фазы, reload server truth) |
| same-tab 409 → auto-rebase без модала (C2/silent-rebase) | repo spec async-save-operations:633 | **PASS** |
| spaceTool edit → ops (пост-S3 контракт) | repo spec :697 | **PASS** |
| kill-tab → IDB redelivery (step2 persistence) | repo spec persistence:285 | **PASS** |
| offline → ops-local → sync on reconnect | repo spec persistence:375 | **PASS** |
| reload mid-series → exactly-once per opId | repo spec persistence:414 | **PASS** |
| 20 edits on 300+ el: coverage budget | repo spec :470 | **FAIL 18/20 (0.90<0.95)** — **pre-existing drift**: идентично на S5-коде (stash-прогон); 2 немаппленных правки в lane-фикстуре спеки (кандидат lane.updaterefs — declared cold по PLAN §8 с S3; спека предполагала 20/20 до расширения словаря). Не регрессия S6; ре-базелина — зона S8 (метрики приёмки) |

Прогонов спек: 2 (первый — 6 env-failures из-за внешнего stop стека чужой сессией; воспроизведён на изолированном проекте чисто). Overlay-crash (_addOverlay pageerror) — инвариант покрыт юнит-зоной C1 (#1002) + полным сьютом; pageerror-assert e2e-спеки C1 не входят в save-контур-регресс (зафиксировано).

## Прогоны

| Слой | Результат |
|---|---|
| backend ops/parity/committed/conflict | 58 passed + 3 subtests |
| frontend save-зоны | 553/554 (hang pre-existing) |
| полный frontend-сьют | 4002 теста, **0 новых падений** vs S5-baseline (diff имён пустой) |
| opsOutbox-зона | 163/163 (3 адаптированных characterization + новый контракт) |

## Метрика путей: **1+1+X** (X=4)

1 интерактивный канал (ops via gateway-lane) + 1 cold-канал (system PUT via lane/gatewayPut) + исключения:
- **X1 participant/pool** — cold навсегда (S4, трансформирующая create);
- **X2 класс C property (camunda custom properties)** — cold до S7+ (round-trip #995; срез-смерти: после snapshot oldBounds/undo-работ);
- **X3 undo-of-delete** — needsFullSave до S7 (compensating create-op);
- **X4 lane.updaterefs / data-ассоциации** — needsFullSave, вокабуларая матрица PLAN §8 (кандидаты на следующую волну после S7).

## Handoff / переносы

- S7: undo-of-delete compensating create-op (+DI), undo coalesced → journal; snapshot oldBounds (снимает needsFullSave undo text-edit аннотации, X2/X3).
- S8: метрики приёмки + ре-базелина coverage-спеки (:470) под текущий словарь; drag-замеры; оба S0-baseline'а.
- Tech-debt: hang-тест (S5-запись), coverage-спека drift.
