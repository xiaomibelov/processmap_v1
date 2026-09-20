# EXEC_REPORT — S3 (op wave A) контура feature/mutation-gateway-c3

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S3 по PLAN.md §7/§8.
Статус: **DONE** (unit/characterization + backend + e2e-гейты (a)-(d) на локальном стеке ветки; push после среза; PR не создавался).

## Цель среза

Op wave A: `elements.move` → батч `shape.move` ops (+ undo inverse по -delta); `spaceTool` → декомпозиция (shape.move + shape.resize + element.updateDi); runtime-снапшот `context.shapes` (s3_pinpoint S2) с fail-closed; перестройка guard'ов staging (keep-final arm гаснет при ops-захвате) и съём full-save arm positional-ветки; backend id→element индекс + scale-guard 1000 эл./50 ops.

## git-proof

```
worktree: /Users/mac/agents_place/kimi_PM/.wt-mutation-gateway-c3
branch:   feature/mutation-gateway-c3
base:     5fcfd17c (S2, VERIFIED, pushed)
commits:  4ec579f0 (маппер+снапшот) → d342bdca (backend индекс) → a244c00b (staging arm вытеснение)
```

Durability-инвариант на каждом префиксе: коммит 1 — drag уходит и в ops, и в keep-final PUT (arm жив); коммит 3 — drag уходит в ops, arm вытеснен (e2e (a) после коммита 3: 0 PUT, reload на месте).

## RED → GREEN evidence

### RED (на S2-HEAD)

6 падений новых тестов по правильной причине:
- `elements.move → батч…`, `undo elements.move…`, `reparent/attach → needsFullSave`, `spaceTool → декомпозиция`, `resizeBounds parity n/s/e/w`, `positional + outbox захватил → arm НЕ взводится` — команда вне whitelist → needsFullSave; guard-перестройка отсутствует.

### GREEN-итерации (зафиксированные находки)

1. **fail-closed id**: первый вариант `strictIdOf` использовал `elementIdOf` — при пустом `id` тот откатывался к `String(ref)` = `"[object Object]"` и пропускал битую запись (тест «shape без id» поймал). Введён `strictIdOf` (S3-мапперы только).
2. **Снапшот терял `direction`/`start`** (скаляры не маппились) — spaceTool-диагностика на живом стеке (`s3-diag-c.mjs`): `commandContext` содержал `movingShapes/resizingShapes/delta/affectedConnections`, но `direction: null` → `resizeBounds` → null → needsFullSave → full-PUT (e2e gate (c) поймал: putBpmn=1/postOps=0). Маппинг скаляров добавлен.
3. **e2e гонял ack**: gate (b) падал на reload — ожидался fetch-отправка, не ack; добавлен `postOpsDone` (fetch завершён) в wait-условие.

## Diffstat

| Файл | +/− |
|---|---|
| `frontend/.../commandToOps.js` | +~130/−10 (батч-мапперы elements.move/spaceTool, strictIdOf, batch-контракт mapCommandToOps) |
| `frontend/.../createBpmnRuntime.js` | +~55/−3 (shapes/movingShapes/resizingShapes/hints/direction/start маппинг; affectedConnections enrichment) |
| `frontend/.../createLocalMutationStaging.js` | +~15/−12 (порядок консультации, гашение arm) |
| `backend/.../ops_applier.py` | +~80/−15 (_ElementIndex, self-healing lookup'и, инвалидация create/delete) |
| тесты (commandToOps +9, staging +2, parity +1 scale-guard) | +~210 |

Минус-код: вытеснены ветки — keep-final full-PUT для ops-захваченного positional (адреса: dragFinal/positional arm больше не взводится для captured; механизм arm сохранён для не-захваченного positional, т.к. `lane.updaterefs` вне ops). Файловый минус в этом срезе умеренный (основной минус-код — вытеснение PUT-водопада: e2e counters 1 PUT → 0 PUT на drag).

## Прогоны

| Прогон | Результат |
|---|---|
| save-зоны frontend (node --test) | **540 тестов, 539 pass**, 1 fail = pre-existing hang-тест (origin/main) |
| backend: parity + applier + scale-guard | **34 passed + 3 subtests**; scale-guard 1000 эл./50 ops = **0.08s** (бюджет 5s) |
| backend: session_operations_api / committed_events / conflict_client_id | 79 pass; 5 fail = **pre-existing env** (sqlite `session_applied_ops`, воспроизведены на чистом backend origin/main через stash) |
| полный frontend-сьют (чистый прогон) | **3988 тестов, 77 fail**; vs S2 (73 unique) 1 имя-флап `presence poller keeps polling…` — проходит 3/3 изолированно, домен presence (вне save-скоупа), классифицирован как load-flaky; контрольный прогон для подтверждения (см. JOURNAL/STATE) |

## e2e-гейты (локальный стек ветки; контейнерный фронт пересобран с кодом S3)

Среда: `COMPOSE_PROJECT_NAME=wt-mgc3-s2` (API 18011, frontend 15177); чужой стек `wt-audit-canvas-409` не тронут; dev-server vite (15178) использовался только для итераций/диагностики. Логи: `.planning/contours/feature/mutation-gateway-c3/evidence/s3/logs/s3-e2e.jsonl`.

| Гейт | Сценарий | PUT /bpmn | POST /operations | reload | Вердикт |
|---|---|---|---|---|---|
| (a) | single drag T_5, реальный mouse | **0** | 1 | элемент на месте (модель+сервер) | PASS |
| (b) | multi-select (T_10+T_11) drag, реальный mouse (shift+click) | **0** | 1 | оба на месте | PASS |
| (c) | spaceTool (createSpace, command-путь UI-инструмента) | **0** | 1 | T_20/T_21 на месте | PASS |
| (d) | регрессия: createShape + label edit | **0** | 1 | созданный элемент на сервере | PASS |

Финальный прогон на контейнере: `S3 E2E GATE: PASS` (exit 0). Dev-итерации: 2 прогона (первый: (b) ack-гонка, (c) direction/start-пробел — оба зафиксированы и исправлены).

## s3-выводы / переносы

1. **Покрыто**: positional drag (single/multi) и spaceTool уходят в ops; arm вытеснён; backend O(N)+scale-guard; fail-closed повсюду (strictIdOf, reparent/attach, direction/bounds).
2. **S4**: artifact-типы (textAnnotation/association/data-refs) — обе стороны fail-closed сохранены; participant остаётся cold.
3. **S5**: property panel → element.updateProperties ops (маппер готов, applier пишет attrs verbatim).
4. **S6**: degrade-замена (ops degrade → больше не silent full-PUT), аудит оставшихся прямых PUT, `fpc_gateway_cold_fallback`-ветки.
5. **S7**: undo-of-delete compensating create-op; undo spaceTool сейчас честный needsFullSave (oldBounds не в снапшоте); elements.move undo — батч parity сделан в S3.
6. Ограничение, зафиксированное честно: programmatic `moveElements` без hints к reparent'у — как и прежде для shape.move op; реальный mouse-drag детектирует reparent через `hints.oldParent` → needsFullSave.

## Handoff-proof

- Цель среза закрыта: wave A vocabulary жив, drag/spaceTool → ops с 0 full-PUT, backend индекс, scale-guard, arm вытеснён без съёма durability (e2e reload-равенство server truth).
- Доказано: RED 6 → GREEN; zones 539/540; backend зелёные; e2e (a)-(d) PASS на контейнере; полный сьют 0 регрессий (1 load-flaky имя, контрольный прогон).
