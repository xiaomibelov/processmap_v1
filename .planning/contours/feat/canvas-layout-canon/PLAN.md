# PLAN — feat/canvas-layout-canon

Контур: канонический layout главной оси + offset-модель шаблонов + чипы свойств.
Ветка: `feature/canvas-layout-canon` (worktree `.wt-canvas-layout-canon`, base = origin/main @ 699e755e).

## Контекст (разведка)

- Кнопка «Выровнять схему» УЖЕ существует: overflow-меню тулбара
  (`ProcessStageDiagramControls.jsx:2004-2036`, i18n `diagram.alignDiagram`),
  проводка `onAlignDiagram → handleAlignDiagram (ProcessStage.jsx:4905-4921) →
  alignDiagramOnInstance (BpmnStage.jsx:475-523)`. Текущий алгоритм —
  наивная квадратная сетка (`computeSimpleGridLayout`, BpmnStage.jsx:445-473).
  Задача — ЗАМЕНИТЬ алгоритм, не добавлять вторую кнопку.
- Геометрия пишется через bpmn-js `modeling` (`moveElements`, `resizeShape`,
  `layoutConnection`, `updateWaypoints`); командный стек автоматически
  конвертируется в ops → SaveOutbox/autosave (`commandToOps.js`). Сохранение
  бесплатно.
- Граф-утилита: `buildExecutionGraphFromInstance` (playback/buildExecutionGraph.js:125).
  Топо-сортировки в коде нет — пишем новым чистым модулем.
- Шаблоны: тип `bpmn_fragment_v1`; pack capture — `templatePackAdapter.js`
  (`isTemplateNodeType` исключает participant/lane/process; узлы с абсолютным
  `di:{x,y,w,h}`; laneHint — строка). Вставка — `insertTemplatePackOnModeler`
  (nativeTree через copyPaste ИЛИ pack-path с нормализацией к min-углу bbox;
  точка вставки `{anchor.x+anchor.width+220, anchor.y-16}`). Backend хранит
  payload_json как есть (`routers/templates.py`), alembic не нужен.
- Чипы свойств: два слоя через bpmn-js overlays:
  legacy `fpc-properties` (`decorManager.js:1761+`, геометрия
  `overlayLayoutModel.js buildOverlayGeometry`: width≈66% узла, topOffset −14,
  translate(-50%, -100%−12px)) и V2 (`v2OverlayRenderer.js:166-257`: top −20,
  left 0, width 100%). Варианта «под узлом» нет ни в одном.

## Дизайн

### T1. Канонический align
Новый чистый модуль `frontend/src/features/process/bpmn/layout/canonLayout.js`:
- Вход: `{nodes: [{id,type,x,y,width,height}], flows: [{id,sourceId,targetId}]}` +
  константы. Выход: `{positions: Map(id→{x,y,width,height}), backEdgeWaypoints: Map(flowId→[[x,y]...])}`.
- Канонические размеры: task 130×80, event 56×56, gateway 50×50; прочие типы —
  текущий размер. GAP=100. Округление всех координат до кратных 10.
- Порядок оси: Kahn от стартовых событий (ноды без incoming sequence flow;
  тай-брейк по текущему x, затем y). Недостижимые ноды — хвост оси.
- Позиции: `x_{i+1}=x_i+width_i+GAP` (x0 = текущий x первой ноды, округл.),
  `centerY = Y0` для всех (Y0 = округлённый centerY первой ноды).
- Back-edge (ребро в уже посещённую ноду) не двигает ноды; ортогональная
  разводка: выход из bottom-center source → вниз до лейна `Y0+200+k*80`
  (k = номер петли) → горизонталь до centerX target → вверх в bottom target.
  Forward-рёбра — через `modeling.layoutConnection`.
- Применение: заменить тело `computeSimpleGridLayout`/`alignDiagramOnInstance`
  (BpmnStage.jsx:445-523): moveElements (delta), resizeShape (канон),
  layoutConnection (forward), updateWaypoints (back-edges), saveXML+fit — как сейчас.
- TDD: сначала `canonLayout.test.mjs` — регрессионный тест из постановки:
  старт → 3 таски → XOR → таска → финиш + петля «no»; проверка всех
  координат по канону (GAP, Y0, кратность 10, размеры, лейн петли Y0+200).

### T2. Offset-модель шаблонов
- Capture (`templatePackAdapter.js` nodeItems/buildTemplateNodeItem):
  anchor = entry-нода (entryNodeId; fallback — левая верхняя). Узлы хранят
  `di: {dx, dy, w, h}` (dx=x−anchor.x, dy=y−anchor.y) + `fragment.anchorNodeId`
  + служебный `anchorAbs {x,y}`.
- Lazy-миграция «один раз»: `normalizeTemplatePack`
  (applyBpmnFragmentTemplatePlacement.js) — если узлы с абсолютными координатами
  и нет anchorNodeId → вычислить anchor по entry/левой верхней, пересчитать в
  offsets. Идемпотентно, пометка `layout: "offset.v1"`.
- Вставка: абсолютные = targetAnchor + (dx, dy); и nativeTree-, и pack-path
  используют одну точку якоря (убираем фиксированный дрейф +220/−16 —
  точка = anchor цели + стандартный зазор, offsets сохраняют геометрию).
- Backend: без изменений (payload opaque). Без openapi-регенерации.
- Тесты: roundtrip capture→insert (геометрия сохранена, новые id), миграция
  legacy-пayload в offsets.

### T3. Чипы свойств
- Legacy (`overlayLayoutModel.js buildOverlayGeometry` + css
  05-02-bpmn-text-contrast.css): width = min(nodeWidth, …) (maxWidth = width
  ноды, ellipsis уже есть); above: bottom = nodeTop−20
  (topOffset −20 + translate(-50%,-100%)); below: top = nodeBottom+20
  (placement-вариант, translate(-50%,0)). Правило размещения: above по
  умолчанию; below если чип вылезает за верх канваса (защита текста таски).
- V2 (`v2OverlayRenderer.js` + legacy_bpmn.css): центрирование (left 50% /
  translateX) + maxWidth = width узла (уже) + тот же зазор 20px.
- Тесты: decorManager.test.mjs (геометрия above/below), v2OverlayRenderer.test.mjs.

## Порядок
1. PLAN (этот файл) → READY_FOR_EXECUTION.
2. T1: RED-тест canonLayout → модуль → wiring в BpmnStage → GREEN.
3. T2, T3 параллельно (subagent'ы), review checkpoints.
4. Полный `npm test` (frontend), выборочный pytest (без изменений backend — не нужен).
5. EXEC_REPORT + REVIEW_REPORT + git proof. Без merge/deploy без approve.

## Риски
- bpmn-js `modeling.updateWaypoints` — проверить доступность в версии (fallback:
  `connection.waypoints = ...` + `modeling.layoutConnection` не подходит для
  back-edge → fallback на прямую запись waypoints + `element.updateDi`-оп через
  modeling.updateProperties? Проверить в ходе T1).
- Двойной путь вставки шаблонов (nativeTree/pack) — привести к одной точке
  якоря, не ломая существующие тесты templatePackAdapter.
- V2/legacy чипы взаимоисключающи — править оба слоя консистентно.
