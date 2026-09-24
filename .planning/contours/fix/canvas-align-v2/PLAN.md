# PLAN — fix/canvas-align-v2

Контур: align v2 — выравнивание внутри лайна, стрелки только транслируем.
Ветка: `fix/canvas-align-v2` (worktree `.wt-canvas-align-v2`, base = origin/main @ dbe1f174,
включает вмерженный #1035). Offset-шаблоны и чипы из #1035 — НЕ трогаем.

## Контекст (разведка, ключевые факты)

- Align v1 (`canonLayout.js` + `alignDiagramOnInstance`, BpmnStage.jsx:469-527): N
  modeling-команд → N undo-шагов; каждая команда → ops-outbox; серверный ops-applier
  (`backend/app/save_services/ops_applier.py:915-934`) поддерживает ограниченный
  whitelist типов → отвергнутый батч = HTTP 422 («Изменение не поддержано…»),
  буфер не чистится → шторм ретраев. Плюс `layoutConnection` пересоздаёт стрелки.
- Кастомная команда commandStack: `registerHandler("fpc.alignDiagram", Handler)`;
  `handler.execute/revert` возвращают dirty-элементы → `_markDirty` →
  `elements.changed` автоматически (diagram-js CommandStack.js:452,503). Вложенных
  custom-хендлеров в проекте нет — пишем первый по каноническому паттерну diagram-js.
- Нет lane-родителя → группировка по pool; containment читается по `el.parent`
  (образцы: `readLaneNameForElement`/`readLaneIdForElement`, BpmnStage.jsx:2159-2183).
  Прямые мутации НЕ вызывают UpdateFlowNodeRefsBehavior (он сидит на modeling) —
  семантическая принадлежность к лейну не меняется; геометрически клампим в lane-rect.
- Waypoints при перемещении bpmn-js НЕ едут сами (MoveShapeHandler постфактом
  релоит через layoutConnection); `elements.move` двигает waypoints целиком только
  когда оба конца в closure. Поэтому трансляция waypoints — ручная, в нашем хендлере.
- Снапшоты версий: отдельного endpoint'а нет; PUT `/api/sessions/{id}/bpmn` планирует
  снапшот prev_xml при изменении (`_legacy_main.py:4542-4593,4754-4764`),
  `source_action` хранится как есть (валидаторов нет; `BpmnXmlIn.source_action`
  — free-form `Optional[str]` → openapi НЕ меняется). User-facing фильтр —
  `_USER_FACING_BPMN_VERSION_ACTIONS` (`:4503-4512`). Лейблы — фронт,
  `revisionEventClassifier.js:90-97` (захардкожены, «До выравнивания» новый).
- Full-XML сохранение: `persistXmlSnapshot(rawXml, hintBase)` (BpmnStage.jsx:5297) →
  `persistence.saveRaw(sid, xml, rev, reason, options)`; `options.sourceAction`
  форвардится в `apiPutBpmnXml` → `body.source_action` (явный sourceAction не
  фильтруется whitelist'ом reason'ов, api.js:1937-1955). Ответ содержит
  `bpmnVersionSnapshot` — можем проверить факт снапшота.
- Outbox: `commandToOps.mapCommandToOps` (commandToOps.js:700-713) — неизвестная
  команда → `needsFullSave: true` → полный сейв через каскад diagram.change.
  Для `fpc.alignDiagram` добавляем явный ignore (`ops: [], needsFullSave: false`),
  т.к. сохранение делаем явно из align (иначе двойной PUT: ours + outbox-full-save
  с техническим лейблом).

## Решения по требованиям

### Требование 1 — область действия (новый модуль `laneRowAlign.js`, чистая функция)
Вход: `{nodes: [{id,type,x,y,width,height,laneKey,laneBounds?}], connections: [{id,sourceId,targetId,waypoints:[{x,y}]}]}`.
- Группировка по `laneKey` (caller: lane id, иначе pool id, иначе `"__default__"`).
- Кластеризация по centerY внутри группы (порог 40, жадная по отсортированным centerY).
- Ряд ≥2 нод: порядок = текущий X; x_0 = round10(x_0); x_{i+1} = round10(x_i+w_i+100);
  rowCenterY = round10(медиана centerY членов); y_i = rowCenterY − h_i/2.
  Размеры к канону (таска 130×80, событие Ø56, шлюз 50×50).
- Кламп целевой позиции в `laneBounds` (margin 10); не влезает → нода не двигается.
- Одиночные ноды / ветки / подпроцессы / boundary events — вне плана (untouched).
- Caller фильтрует типы: `/Task$/` (не SubProcess), `/Event$/` (не BoundaryEvent),
  `/Gateway$/`; участвуют только ноды с конечными bounds.

### Требование 2 — стрелки только транслируются
Для каждой connection: dS = delta(source), dT = delta(target) из плана нод.
- Оба конца с одной дельтой → все waypoints (и `original` точек) +дельта.
- Один конец → вся ломаная +дельта этого конца.
- Оба с разными дельтами → вся ломаная +дельта конца-источника (детерминированно,
  форма сохраняется; «кривой секвенс чинится позицией таски» — по постановке).
- Ни один → не трогаем. Все мутации — сдвиг координат существующих точек
  (сохраняются count/order/объекты точек). `layoutConnection` в коде align ОТСУТСТВУЕТ.

### Требование 3 — одна операция + страховка отката
- Все мутации внутри одной команды `fpc.alignDiagram` (execute/revert хендлер,
  старые значения в ctx) → один шаг undo/redo через существующий UI undo.
- Снапшот «До выравнивания»: PUT результирующего XML с `source_action: "align"`
  атомарно создаёт версию prev (бэкенд планирует prev-снапшот в той же операции) —
  «существующий API версий», no-op guard не блокирует (XML изменён, иначе план
  пустой → noop без сохранения). Ответ saveRaw несёт `bpmnVersionSnapshot`;
  `ok=false` ИЛИ снапшот не создан → `commandStack.undo()` (один шаг) →
  `{ok:false, error}` → пользователю сообщение через существующий genErr.
- Ограничение (фиксируем): undo ПОСЛЕ успешного сохранения откатывает канвас,
  но не персистит откат (outbox игнорирует команду) — конвергенция при следующем
  изменении. Критерий «undo одним шагом» — про канвас, выполняется.

### Требование 4 — сохранение без 422
Выбрано: **align сохраняет полным XML одной операцией** (не commandToOps).
- `commandToOps` получает явный ignore для `f ops.alignDiagram` → ни ops, ни
  needsFullSave → outbox тих, 422 невозможен by construction.
- Сохранение: `persistXmlSnapshot(xml, "align_diagram", {sourceAction:"align"})`
  (persistXmlSnapshot расширяется опциональным options-параметром → saveRaw уже
  умеет sourceAction). Базовая версия — через существующий resolveBaseDiagramStateVersion
  в saveRaw (CAS-tracker), 409-обработка — штатная retry-логика pipeline rawXml.
- Backend: `"align"` → `_USER_FACING_BPMN_VERSION_ACTIONS` (фронт-фильтр версий
  покажет «До выравнивания» через revisionEventClassifier). Схема не меняется.

## Состав изменений
1. NEW `frontend/src/features/process/bpmn/layout/laneRowAlign.js` + `.test.mjs`
   (acceptance: row-align внутри lane; запрет пересадки/кламп; translation оба/один
   конец; singleton/subprocess untouched; laneBounds clamp).
2. DELETE `canonLayout.js` + `canonLayout.test.mjs` (логика v1 выводится из эксплуатации).
3. `BpmnStage.jsx`: mapping нод (laneKey/laneBounds через readLaneIdForElement +
   walk до participant), кастомный хендлер + регистрация, `alignDiagramOnInstance`
   (plan → command → saveXML → persistXmlSnapshot+sourceAction align → verify
   snapshot → undo on failure), `persistXmlSnapshot` +options.
4. `bpmnStageImperativeApi.js`: проброс `persistXml` в alignDiagramOnInstance.
5. `commandToOps.js`: ignore-case `fpc.alignDiagram` (+ тест).
6. `revisionEventClassifier.js`: kind/label «До выравнивания» (+ тест если есть suite).
7. Backend `_legacy_main.py`: `"align"` в user-facing actions (+ тест при наличии).
8. `BpmnStage.align-reset.test.mjs`: гейт «нет layoutConnection в align», снятие
   ссылки на canonLayout.
9. appVersion v1.0.153 + changelog.

## Критерии приёмки (маппинг)
- Ноды в своих лайнах/пулах → группировка по laneKey + кламп (тест).
- Канон + зазор 100 в ряду → точный тест координат.
- Форма секвенсов сохранена → translation-тесты (identity точек, только +delta).
- Undo одним шагом → одна команда commandStack (структурно + revert-тест хендлера).
- Версия «До выравнивания» → sourceAction align + backend user-facing + проверка
  bpmnVersionSnapshot в ответе.
- Сохранение без ошибок → full-XML PUT, ops-outbox игнорирует команду (тест
  commandToOps), 422 невозможен.

## Риски
- Прямые мутации x/y + di.bounds: проверить saveXML-вывод (тест/ручная
  верификация) — DI синхронизируем руками в хендлере.
- `elements.changed` от commandStack перерисует ноды; waypoints redraw
  connection — гарантируется dirty-механизмом.
- appUpdate/version-пины в тестах (dark-theme-contrast ждёт v1.0.141) —
  пре-существующие, не трогаем.
