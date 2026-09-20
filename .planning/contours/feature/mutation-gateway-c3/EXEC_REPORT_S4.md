# EXEC_REPORT — S4 (artifact-типы волнами) контура feature/mutation-gateway-c3

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S4 по PLAN.md §7/§8.
Статус: **DONE** (3 волны, каждая — работоспособный коммит с e2e-гейтом; push после среза; PR не создавался).

## Волны и результат

| Волна | Типы | Коммит | e2e-гейт |
|---|---|---|---|
| 1 | textAnnotation + association | `340274f0` | PASS (create/move real drag/delete; reload: текст+assoc+DI server truth; каскад удаления) |
| 2 | dataStoreReference / dataObjectReference | `001a0410` | PASS (create/move real drag/delete; companion dataObjectRef; reload: companion каскад, dataStore на месте) |
| 3 | lane (flowNodeRef) | `42c67330` | PASS (pool-fixture: create/move/delete; reload: laneSet+isHorizontal+DI server truth; populated Lane_0 нетронут) |
| — | **participant/pool** | **НЕ тронут** | **cold навсегда** (needsFullSave обеих сторон; обоснование в PR_S4) |

## git-proof

```
worktree: /Users/mac/agents_place/kimi_PM/.wt-mutation-gateway-c3
branch:   feature/mutation-gateway-c3
base:     bfa718c6 (S3, VERIFIED, pushed)
```

## RED → GREEN evidence (по волнам)

- **Волна 1 RED**: frontend 3 (типы в pattern → needsFullSave; updateLabel-ветка отсутствует); backend 5 (`full_save_required_for_bpmn_type`, отсутствие text-child/cascade). GREEN-адаптации: 4 step1-характеризации artifact-full-save инвертированы/переведены на остающиеся cold-типы (по условию «снимать по одному типу»).
- **Волна 2 RED**: frontend 1 + backend 3 (companion). GREEN-находка (e2e-итерация): api-контейнер держал пред-S4 код в памяти (volume свежий, uvicorn без reload) → 422 на свежих типах; **restart api после backend-правок — обязательный шаг**, зафиксирован.
- **Волна 3 RED**: frontend 1 + backend 3 (laneSet/processRef/isHorizontal/lane_not_empty). GREEN-находка: та же ловушка restart api (повторная фиксация); тест-ассерт lane-в-process исправлен на lane-в-laneSet (семантика golden).

Golden-эталоны (реальные full-PUT bpmn-js, lane OFF): `evidence/s4/logs/s4-golden.xml` (волна 1: `<bpmn:text>` child; association без incoming/outgoing; dataObjectReference с companion), `s4-wave23-golden.xml` (laneSet/isHorizontal; orphan dataObject чистится). Probes: `s4-probe-artifacts.mjs`, `s4-probe-wave23.mjs`, `s4-probe-golden.mjs`.

## Diffstat (3 волны суммарно)

| Файл | Δ |
|---|---|
| `frontend/.../commandToOps.js` | pattern −3 типа по волнам; updateLabel-ветка textAnnotation (text+resize, undo→needsFullSave) |
| `backend/.../ops_applier.py` | −_UNSAFE ×5 типов; association create без incoming/outgoing; textAnnotation text-child; dataObject companion create/delete; lane laneSet/processRef/isHorizontal; lane_not_empty typed 422 |
| тесты frontend | +3 волновых блока, step1-списки адаптированы |
| тесты backend | +11 (golden/parity/fail-closed) |

Новых production-модулей нет — вытеснение full-путей за счёт снятия типов (минус-код по веткам: unsafe-множество схлопано с 8 до 3 типов; FULL_SAVE_REQUIRED pattern с 8 до 4).

## e2e-гейты (итоговый прогон на контейнере с кодом среза, порт 15177)

| Фаза волны | PUT /bpmn | POST /operations | reload server truth |
|---|---|---|---|
| w1 create (annotation+assoc+text) | 0 | 1 | текст/assoc/DI ✓ |
| w1 move (real drag) | 0 | 1 | ✓ |
| w1 delete (cascade assoc) | 0 | 1 | ann+assoc gone ✓ |
| w2 create (store+dataObjRef) | 0 | 1 | companion ✓ |
| w2 move (real drag) | 0 | 1 | DI 932,615 ✓ |
| w2 delete (dataObjRef) | 0 | 1 | ref+companion gone, store ✓ |
| w3 create (lane) | 0 | 1 | laneSet ✓ |
| w3 move (lane) | 0 | 1 | DI 0,310 isHorizontal ✓ |
| w3 delete (пустой lane) | 0 | 1 | lane gone, Lane_0 ✓ |

Логи: `evidence/s4/logs/s4-e2e-wave{1,2,3}.jsonl` (dev-итерации с зафиксированными находками + контейнерные финалы).

## Undo-семантика (явная фиксация по волнам)

- create artifact (все волны) → **compensating delete-op parity** (обе стороны: cascade association/companion/lane-DI готовы к компенсации).
- move artifact → **-delta batch parity** (S3, generic).
- **text-edit annotation (волна 1) → undo = needsFullSave** (oldBounds не живёт в runtime-снапшоте; причина зафиксирована, без молчаливого промежуточного состояния).
- delete artifact → undo = needsFullSave (общий undo-of-delete — S7, вне S4-скоупа).
- delete populated lane → backend typed 422 `lane_not_empty` (fail-closed E3) → клиентский degrade в full-save (честный, не молчаливый).

## Прогоны

| Слой | Результат |
|---|---|
| save-зоны frontend | 549 тестов, 548 pass, 1 fail = pre-existing hang |
| backend ops/parity/committed/conflict | **56 passed + 3 subtests** |
| полный frontend-сьют | см. сводку ниже (0 новых падений vs S3-baseline) |

## Метрика «пути записи до/после» (после S4)

18 → **14**: textAnnotation, association, dataStoreReference, dataObjectReference, lane ушли из full-путей в ops (5 интерактивных командных классов × create/move/delete как один путь каждый по A5-методу «пути записи»; честный счёт по A5-map: вычеркнуты полные PUT-ветки для этих типов). Остаются full-пути: participant (cold навсегда), dataInput/OutputAssociation, property panel (S5), degrade (S6), undo-of-delete (S7).

## Handoff-proof / переносы на S5+

- Цель закрыта: волны 1-3 в ops с golden-parity и fail-closed; participant cold зафиксирован; e2e-гейты зелёные.
- S5: property panel → element.updateProperties ops (маппер/applier готовы; verbatim attrs).
- S6: degrade-замена (в т.ч. lane_not_empty-путь перестанет быть «silent full-PUT via degrade»), аудит прямых PUT, `fpc_gateway_cold_fallback`-ветки.
- S7: undo-of-delete compensating create-op (в т.ч. undo text-edit annotation — снятие needsFullSave через snapshot oldBounds); undo spaceTool.
