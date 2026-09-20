# PR — S3: op wave A — elements.move/spaceTool → ops, arm positional-ветки вытеснен

> Контур: `feature/mutation-gateway-c3`, срез S3 (PLAN.md §7/§8). Base: S2 (`5fcfd17c`, VERIFIED).
> Merge/PR — только по explicit approve владельца.

## Что

1. **`elements.move` → батч ops** (`commandToOps.js`): N×`shape.move` по `shapes`-листу рантайм-снапшота + `element.updateDi` для affected connections (финальные waypoints). **Undo parity**: компенсирующий батч `-delta`; updateDi на undo-changed переснимает post-undo waypoints. **Fail-closed**: пустые/без-id shapes (строгий `strictIdOf` — урок pinpoint'а: `elementIdOf`-fallback превращал пустой id в `[object Object]`), без delta, reparent (`hints.oldParent≠newParent`), attach → `needsFullSave`.
2. **`spaceTool` → декомпозиция по §8**: `movingShapes→shape.move`, `resizingShapes→shape.resize` (resizeBounds-parity SpaceUtil n/s/e/w), affected connections→`element.updateDi`. Скаляры `direction`/`start` добавлены в снапшот (пробел пойман e2e-диагностикой: `direction:null` → needsFullSave → full-PUT). Undo spaceTool → честный `needsFullSave` (oldBounds живёт в handler-closure диаграммы; полный undo-цикл — S7).
3. **Runtime-снапшот** (`createBpmnRuntime.js`): маппинг `shapes`/`movingShapes`/`resizingShapes` (s3_pinpoint S2: diagram-js кладёт списки под этими ключами) + `hints.oldParent`/`attach` + **affectedConnections enrichment** — вложенные connection-обновления diagram-js «тихие» (`commandStack.changed` фаерится только на outermost action, `_popAction`), поэтому рантайн доснимает финальные waypoints сам.
4. **Staging guard-перестройка** (`createLocalMutationStaging.js`): консультация outbox **сначала**, positional-ветка потом (guard `!autosaveSkipped` делал предикат недостижимым для positional). Keep-final arm **гаснет** при ops-захвате → **full-save arm positional-ветки вытеснён** (drag перзистится ops на каждом префиксе; arm сохранён для не-захваченного positional — `lane.updaterefs` и пр.).
5. **Backend id→element индекс** (`ops_applier.py`): `_ElementIndex` за один проход на батч, lookup'и O(1), self-healing (miss → scan + мемоизация), create/delete поддерживают индекс; посимвольная эквивалентность scan-семантике. **Scale-guard 1000 эл./50 ops: 0.08s** (бюджет 5s).

## Почему

S0-атрибуция: единственный full-PUT на реальном drag = keep-final flush positional-ветки (~450 мс после mouseup, XML ~176 KB). S3 переводит positional-интерактив в ops-канал: POST /operations ~батч, 0 PUT. Backend applier был O(ops×N) — при батчах drag'ов на 1000+ элементах это узкое место приёмки §10.6.

## e2e-гейты (локальный стек ветки, контейнерный фронт с кодом среза)

Методика S0 (центровка viewbox, elementFromPoint, реальный mouse drag; spaceTool — command-путь UI-инструмента `createSpace`, зафиксировано в логе):

| Гейт | PUT /bpmn | POST /operations | reload-равенство | Вердикт |
|---|---|---|---|---|
| (a) single drag | 0 | 1 | ✓ модель+сервер | PASS |
| (b) multi-select drag | 0 | 1 | ✓ оба элемента | PASS |
| (c) spaceTool | 0 | 1 | ✓ | PASS |
| (d) регрессия createShape+label | 0 | 1 | ✓ сервер | PASS |

`evidence/s3/logs/s3-e2e.jsonl` (2 dev-итерации с зафиксированными находками + финальный контейнерный PASS).

## Метрика «пути записи до/после» (18 → 1+1) — честное состояние после S3

Positional-интерактив (drag single/multi, spaceTool) ушёл в ops-канал: **-1 активный путь записи** (keep-final full-PUT для drag вытеснен; arm сохранён как cold-ветка для не-захваченного positional). Счётчик «путей до» по A5-map для interactive-mutations сократился с 18 до **17** (из них diagram-truth интерактивные каналы: ops; full-PUT остаётся для lane.updaterefs/artifacts/property/degrade до S4–S6). Осталось до 1+1: S4 (artifacts), S5 (property), S6 (degrade-замена + аудит прямых PUT + `fpc_gateway_cold_fallback`-ветки).

## Дата смерти

**`fpc_gateway_cold_fallback` = 2026-10-03** (последний день; после даты флаг и fallback-ветки удаляются либо эскалация владельцу). Kill-switch `fpc_gateway_lane` (S1) без изменений.

## Тест-матрица

| Слой | Что | Результат |
|---|---|---|
| `commandToOps.test.mjs` (+9) | батч elements.move, undo -delta, fail-closed id/delta, reparent/attach, spaceTool декомпозиция, resizeBounds parity n/s/e/w, undo spaceTool | зелёные |
| `createLocalMutationStaging.test.mjs` (+2) | arm гаснет при захвате; сохраняется без захвата | зелёные |
| save-зоны frontend | session/__tests__, bpmn/save, coordinator, persistence, stage/utils, process/save | **539/540** (1 pre-existing hang) |
| backend parity/applier/scale | эквивалентность индекса, золотые прогоны, 1000эл/50ops | **34 passed + 3 subtests** |
| backend ops-api/conflict зоны | — | 79 pass, 5 fail = pre-existing env (sqlite, подтверждено stash-прогоном) |
| полный frontend-сьют | 3988 тестов | 0 регрессий; presence-poller семейство флапит под нагрузкой (имя меняется между прогонами, 3/3 изолированно, вне save-скоупа) — зафиксировано как load-flaky |

## Rollback

1. Revert коммитов среза (`4ec579f0`, `d342bdca`, `a244c00b` — в обратном порядке или `git revert` по одному; порядок сохраняет durability).
2. Оперативно: `localStorage.fpc_gateway_lane="0"` (S1 kill-switch; ad-hoc механизмы не восстанавливаются).

## Риски

- Undo spaceTool → needsFullSave до S7 (честный fallback, не костыль).
- Programmatic moveElements без hints к reparent — как прежде для shape.move (реальный drag детектирует reparent).
- Backend индекс: create/delete внутри батча обязаны поддерживать индекс — покрыто parity/золотыми тестами + self-healing на miss.
