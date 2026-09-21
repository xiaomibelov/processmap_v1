# PLAN — fix/canvas-move-di-desync-409-tracker

Контур: fix, один контур на все 4 находки аудита `audit/canvas-move-di-desync-422`.
Baseline: `origin/main @ 90556bae` (включает C3 #1005 и #1007).
Approve: владелец, 2026-09-21 (scope — все 4 пункта, порядок 1→2→3→4).

## 0. Контекст (из аудита, evidence в audit-контуре)

- **F1 CONFIRMED**: одиночный drag фаерит `shape.move`, enrichment
  `enrichPositionalSnapshot` (createBpmnRuntime.js) покрывает только
  `elements.move`/`spaceTool` → server truth теряет waypoints инцидентных
  стрелок → растянутые стрелки после reload. Регрессия C3 (до C3 full-PUT
  перезаписывал DI целиком).
- **F2 CONFIRMED**: `shape.resize` — тот же класс (resize-down).
- **F3**: reconnect by design не мигрирует DI-edge (backend
  `_apply_connection_reconnect`, API.md §5.4) → визуально растянуто до полного
  сохранения. Фикс = frontend companion `element.updateDi`.
- **F5 CONFIRMED (статика)**: собственный ops-ack пишет версию только в
  syncStateStore (createSaveOutbox.js), casVersionTracker (база full-PUT /
  meta-PATCH) не adopt'ится → после серии ops-мутаций CAS-guarded пути идут со
  stale base → ложный 409 DIAGRAM_STATE_CONFlict. Cross-tab heal не спас
  сессию владельца 2ce69bd74c — артефакт с объяснением обязателен (S2).
- Модал 409 показывает «?/?»: нет clientBase в hybrid-ветке, reader версий
  из detail не единый по формам ответа.

## 1. Scope (жёсткие ограничения владельца)

1. Метрика путей записи `1+1+X` НЕ растёт (нет новых PUT-путей, флагов,
   fallback'ов, op-типов).
2. Backend-структура unchanged: апплаеры `updateDi` / `shape.move` /
   `shape.resize` уже существуют (C3), только frontend-маппинг/обогащение.
3. Fail-closed: битый/неполный контекст → needsFullSave, не молчаливая потеря.
4. Min-код: меняем только снапшот-слой, мапперы и reader'ы.

## 2. Срезы и порядок

### S1 — F1/F2: enrichment affectedConnections для shape.move / shape.resize (ПЕРВЫМ, data integrity)

- `enrichPositionalSnapshot`: ветки `shape.move` → collectIncidentConnections([context.shape]),
  `shape.resize` → те же инцидентные связи reshaped-шейпа; дескрипторы
  affectedConnections с актуальными waypoints (reuse существующего helper'а,
  parity с elements.move).
- `mapShapeMove` / `mapShapeResize`: допускают updateDi-батч из affectedConnections
  (мапперы уже умеют — S3-контракт C3), порядок: shape op → updateDi batch.
- strictIdOf fail-closed: не-строковый id → needsFullSave.
- **Undo-паритет**: снапшот post-undo, inverse по captured waypoints — как
  elements.move (S7-контракт C3).
- Тесты (RED→GREEN):
  - unit: enrichment shape.move/resize — affectedConnections непустой, waypoints
    актуальные; битый контекст → needsFullSave.
  - unit: маппер shape.move+updateDi batch, порядок ops, strictIdOf.
  - unit: undo — inverse по captured waypoints.
  - e2e (S0-методика, локальный стек ветки): «single drag с инцидентными
    стрелками → reload → waypoints в server truth пристыкованы»; «resize-down →
    reload → пристыкованы».
- Оценка: 0.5 дн.

### S2 — F5: ops-ack adopt в casVersionTracker (вариант A)

- `_onAck` (createSaveOutbox.js): при успешном ops-flush
  `setTrackedDiagramStateVersion(sid, ackVersion)` (идемпотентно).
- Проверить отсутствие double-bump / петли с crossTabVersionSync: notify
  cross-tab только при реальном изменении значения; adopt чужого
  ops_committed (opsRemoteApply) не дублируется.
- **Обязательный артефакт PR**: `WHY_NO_CROSS_TAB_HEAL.md` — почему cross-tab
  heal НЕ спас сессию 2ce69bd74c (одиночная вкладка / heal требует второго
  publisher'а / adopt-on-clean условия) → определяет, нужен ли defense-in-depth
  вариант B (не реализуем без отдельного approve).
- Тесты: unit — ack обновляет трекер; гонка ack + 409-rebase → один adopt;
  cross-tab notify не дублирует.
- Оценка: 0.25 дн (с тестами и артефактом).

### S3 — Модал 409: единый reader версий

- Единый reader `server_current_version`/`base`/`changed_keys` из detail всех
  форм 409 (PUT /bpmn, PATCH /sessions, POST /operations); hybrid-ветка
  (ProcessStage.jsx) передаёт clientBase из трекера на момент отправки.
- «?» допустим только при реальном отсутствии данных; changed_keys обязателен
  при наличии.
- Тесты: unit-матрица форм 409 (3 пайплайна × полный/частичный detail),
  hybrid-ветка clientBase.
- Оценка: 0.25 дн.

### S4 — F3: reconnect companion updateDi

- `mapConnectionReconnect`: дополнительный `element.updateDi` с waypoints из
  снапшота (enrichment S7 их несёт); waypoints отсутствуют → reconnect без
  updateDi (текущее поведение, by design), fail-closed без исключений.
- Тесты: unit — companion op, порядок, отсутствие waypoints; e2e: reconnect →
  reload → маршрут к новым endpoints.
- Оценка: 0.25 дн.

## 3. Тест-матрица приёмки контура

| # | Сценарий | Гейт |
|---|----------|------|
| T1 | unit: enrichment shape.move/resize + undo + strictIdOf fail-closed | зелёные |
| T2 | e2e: single drag → reload → waypoints стрелок пристыкованы | зелёный |
| T3 | e2e: resize-down → reload → пристыкованы | зелёный |
| T4 | e2e: ops-мутация → class-C PUT → meta PATCH → 0×409 | зелёный |
| T5 | unit: модал 409 — версии из detail всех форм, clientBase, changed_keys | зелёные |
| T6 | e2e: reconnect → reload → маршрут к новым endpoints | зелёный |
| T7 | Регресс: все save-спеки C3 (step1/step2/C1/C2/:470) | зелёные |
| T8 | Метрика путей 1+1+X — без изменений (доказать diff'ом) | X=3 как было |

## 4. Риски и откат

- **R1**: updateDi пишет absolute waypoints для auto-layout-якорей — совпадает
  с семантикой elements.move (S3, battle-tested). Откат: revert S1.
- **R2**: двойной adopt версии (ops-ack + 409-rebase гонка) — setVersion
  идемпотентен; unit-гонка в S2. Откат: revert S2 (поведение = текущее).
- **R3**: модал читает detail-поля, которых сервер не шлёт для какой-то формы —
  fail-open «?» (допустимо по approve), changed_keys по наличию. Никакого
  искусственного дефолта.
- Раздельные коммиты по срезам → revert любого среза независим.

## 5. Soak

Батарея `audit/c3-stage-soak-24h` +2 сценария (`di-docking-after-mutations`,
`ops-then-cold-save-no-409` — описаны в аудит-контуре). Текущее окно
досматриваем до +24h, но prod оно НЕ разблокирует. Soak-часы рестартуют после
stage-деплоя этого фикса (отдельный release-контур по approve).

## 6. Гейты

- PR на русском, один PR на контур (или по срезам — по решению гейта/владельца).
- Merge — только по explicit approve владельца. Deploy запрещён.
- Push в origin после каждого среза (как в C3: push без PR/merge — допустимо).
