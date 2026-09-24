# EXEC_REPORT — fix/canvas-align-v2

Дата: 2026-09-24. Ветка: `fix/canvas-align-v2` (worktree `.wt-canvas-align-v2`,
base origin/main @ dbe1f174 — включает вмерженный #1035).
Контекст: PR #1035 (align v1, «всё в одну ось») на много-пульных схемах выдёргивал
лайны в строку, переразводил стрелки и валил сохранение в 422-шторм. Offset-шаблоны
и чипы из #1035 — не тронуты.

## Требование 1 — строго внутри лайна — DONE

Новый чистый модуль `frontend/src/features/process/bpmn/layout/laneRowAlign.js`
(+ 11 тестов):
- Группировка по `laneKey` (caller: lane id через walk `el.parent`, иначе
  participant id, иначе `__default__`). Пересадка между lane/pool исключена
  конструкцией: кламп целевых координат в lane-rect (margin 10; не влезает →
  нода не двигается).
- Кластеризация по centerY (порог 40, жадная). Ряд ≥2 нод: порядок = текущий X,
  размеры к канону (таска 130×80, событие Ø56, шлюз 50×50; подпроцессы и
  boundary events исключены), `x_{i+1}=round10(x_i+width+100)`,
  `centerY ряда = round10(медиана)`.
- Одиночные ноды / ветки / подпроцессы — вне плана.
- `canonLayout.js` v1 выведен из эксплуатации (удалён вместе с тестом).

## Требование 2 — стрелки только транслируются — DONE

- План трансляций на чистой геометрии: оба конца одна дельта → все waypoints
  +дельта; один конец → ломаная +дельта этого конца; разные дельты → +дельта
  источника (детерминированно, зафиксировано в PLAN).
- Применение — сдвиг координат СУЩЕСТВУЮЩИХ точек (count/order/объекты точек и
  `original` сохраняются; DI-вейпоинты сдвигаются синхронно).
- `layoutConnection`, `updateWaypoints`, `moveElements` в коде align ОТСУТСТВУЮТ
  (структурный гейт `BpmnStage.align-reset.test.mjs` на срезе тела функции).

## Требование 3 — одна операция + страховка отката — DONE

- Все мутации — в одной команде commandStack `fpc.alignDiagram`
  (`registerHandler`, execute/revert с записями старого состояния в ctx) →
  один шаг undo/redo через существующий UI.
- Снапшот «До выравнивания»: `persistXmlSnapshot(xml, "align_diagram",
  {sourceAction: "align"})` → full-PUT, сервер атомарно планирует версию prev_xml
  с `source_action="align"` (существующий механизм bpmn_versions, no-op guard не
  блокирует — XML изменён; план пустой → noop без сохранения).
- Ответ saveRaw несёт `bpmnVersionSnapshot`; `ok=false` ИЛИ снапшот не создан →
  `commandStack.undo()` один шаг → `{ok:false, error}` → пользователю сообщение
  (существующий genErr-путь).
- Ограничение (зафиксировано): undo после успешного сохранения откатывает канвас
  без персиста отката (outbox игнорирует команду) — конвергенция при следующем
  изменении. Критерий «undo одним шагом» (канвас) выполняется.

## Требование 4 — сохранение без 422 — DONE

Решение (зафиксировано в PLAN): align сохраняет полным XML одной операцией,
ops-конвейр не задействован.
- `commandToOps.mapCommandToOps`: явный ignore для `fpc.alignDiagram`
  (execute и undo) — ни ops, ни needsFullSave → outbox тих, 422 невозможен
  by construction (тест добавлен).
- Full-PUT идёт через существующий rawXml-pipeline (`saveRaw` → `apiPutBpmnXml`
  с явным `sourceAction: "align"`; базовая версия — штатный CAS-tracker,
  409-обработка — существующая retry-логика pipeline).

## Backend (минимальный)

- `_legacy_main.py`: `"align"` в `_USER_FACING_BPMN_VERSION_ACTIONS`
  (история версий покажет версию «До выравнивания» в user-facing списке).
- `BpmnXmlIn.source_action` — free-form `Optional[str]` → схема OpenAPI НЕ
  меняется → регенерация docs/openapi.yaml не требуется (§6.1 контракта).
- `tests/test_latest_user_facing_bpmn_version.py`: `"align"` в эталонном
  множестве теста.

## Frontend прочее

- `revisionEventClassifier.js`: kind "align" + лейбл «До выравнивания».
- `bpmnStageImperativeApi.js`: проброс `persistXml` в align.
- `BpmnStage.jsx`: `persistXmlSnapshot(rawXml, hintBase, options)` —
  опциональный проброс options в saveRaw; success-return теперь включает
  `bpmnVersionSnapshot`.
- appVersion v1.0.153 + changelog (2 строки).
- Гейты: `BpmnStage.align-reset.test.mjs` переписан под v2 (fpc.alignDiagram,
  laneRowAlign, запрет layoutConnection/updateWaypoints/moveElements в теле align);
  `BpmnStage.messageflow-egress.test.mjs` — dialect+sourceAction align на persist.

## Проверки

- laneRowAlign 11/11; align-reset + egress + commandToOps 103/103;
  stage/ui 152/153 (1 пре-существующий фейл sessionPresenceModel — доказан
  baseline-прогоном на origin/main).
- Полный `npm test`: см. REVIEW_REPORT (итог PR).
- Backend pytest (test_latest_user_facing_bpmn_version): см. REVIEW_REPORT.

## Git proof

- branch `fix/canvas-align-v2`, HEAD — см. коммиты; diffstat: laneRowAlign.js(+тест)
  новые, canonLayout.js(+тест) удалены, BpmnStage.jsx, bpmnStageImperativeApi.js,
  commandToOps.js(+тест), revisionEventClassifier.js, appVersion.js,
  backend/_legacy_main.py, backend/tests/test_latest_user_facing_bpmn_version.py.
