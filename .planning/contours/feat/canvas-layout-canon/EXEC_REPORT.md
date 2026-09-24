# EXEC_REPORT — feat/canvas-layout-canon

Дата: 2026-09-24. Ветка: `feature/canvas-layout-canon` (worktree `.wt-canvas-layout-canon`, base origin/main @ 699e755e).

## Задача 1. Кнопка «Выровнять схему» — канонический layout главной оси — DONE

Кнопка уже существовала (overflow-меню тулбара, i18n `diagram.alignDiagram`) — заменён алгоритм внутри существующего действия, вторая кнопка не добавлялась.

- Новый чистый модуль `frontend/src/features/process/bpmn/layout/canonLayout.js`:
  - Порядок оси: DFS от стартовых событий, исходящие рёбра по (x, y) цели; ребро в посещённую ноду = back-edge (петля). Недостижимые ноды — детерминированный хвост оси.
  - Позиции: `x_{i+1} = round10(x_i + width_i + GAP 100)`; `centerY = Y0 = round10(centerY первой ноды)` для всех.
  - Канонические размеры: таска 130×80 (`/Task$/`), событие 56×56 (`/Event$/`), шлюз 50×50 (`/Gateway$/`); прочие типы — текущий размер.
  - Петли не двигают ноды; ортогональная разводка: bottom-center source → лейн `Y0+200` → centerX target → bottom target; каждая следующая x-перекрывающаяся параллельная петля +80. Все точки кратны 10.
- Применение в `BpmnStage.jsx` (`alignDiagramOnInstance`): `modeling.moveElements` + `modeling.resizeShape` (канон), forward-рёбра — `modeling.layoutConnection`, петли — `modeling.updateWaypoints`. Сохранение бесплатно через ops-outbox (`commandToOps`); XML-экспорт с message-flow dialect сохранён.
- Тесты: `canonLayout.test.mjs` (5 тестов), включая регрессионный acceptance из постановки (старт → 3 таски → XOR → таска → финиш + петля «no») с точной проверкой координат/размеров/лейна. Существующие гейты `BpmnStage.align-reset.test.mjs`, `ProcessStageDiagramControls.align-reset.test.mjs`, `BpmnStage.messageflow-egress.test.mjs` — GREEN (гейт расширен под `canonLayout`).
- Коммит: `c176eb4d`.

## Задача 2. Offset-модель шаблонов и вставки — DONE

- Capture (`templatePackAdapter.js`): `applyOffsetLayoutToPackFragment` — anchor = entry-нода (fallback верхняя левая); узлы хранят `di {dx, dy, w, h}`; `fragment.anchorNodeId` + `anchorAbs` + маркер `layout: "offset.v1"`. Основной и subprocess-subtree пути.
- Lazy-миграция («один раз») на чтении (`normalizeTemplatePack` в `applyBpmnFragmentTemplatePlacement.js`): legacy-паки с абсолютными `di` конвертируются в offsets идемпотентно по маркеру. Backend не тронут (payload opaque JSON), alembic/openapi не требуются.
- Вставка (pack-path): абсолютные = targetAnchor + offset, без minX/minY-нормализации → относительная геометрия «исходника» сохраняется (свимлейны/круг на местах); новые id по-прежнему генерирует bpmn-js. nativeTree-path (copyPaste) не тронут — геометрия дерева сохраняется сама.
- Тесты: +5 в `templatePackAdapter.test.mjs`, +7 в `applyBpmnFragmentTemplatePlacement.test.mjs` (capture offsets, roundtrip anchor+offset, миграция по entry/top-left, идемпотентность, bbox стабилен). Suite: 111 pass / 0 fail.
- Коммит: `c5151863`.

## Задача 3. Чипы свойств — DONE

- Legacy (`overlayLayoutModel.js buildOverlayGeometry` + `decorManager.js` + `05-02-bpmn-text-contrast.css`): над нодой — `topOffset −20` + `translate(-50%, -100%)` ⇒ bottom = nodeTop − 20, центр по центру, width = width ноды (floor 76), ellipsis сохранён; под нодой — `topOffset = height + 20`, класс `fpcPropertyOverlay--below` ⇒ top = nodeBottom + 20, перекрытие текста таски исключено. Размещение below — при `preferBelow`/`viewportTopLimit` либо детерминированно при `bounds.y < 40` (нода у самого верха). Placement включён в geometry signature (корректный пересоздание overlay).
- V2 (`v2OverlayRenderer.js`/CSS `legacy_bpmn.css`): центрирование контракта (`display:flex; justify-content:center`), maxWidth = width узла и зазор 20px подтверждены тестом. Sequence-flow anti-collision не тронут.
- Тесты: новый `overlayLayoutModel.test.mjs` (7 тестов), обновлены `decorManager.test.mjs`, `v2OverlayRenderer.test.mjs`. decor+overlay suites: 114 pass / 6 fail — все 6 фейлов docs-badge пре-существующие (проверено на чистом baseline origin/main с тем же node_modules: те же 2 pass / 6 fail), причина — jsdom-окружение, не контур.
- Коммит: `a5c5fb5b`.

## Проверки

- Точечные suites: layout 5/5; align/controls/egress 14/14; template+placement 111/111; decor+overlay 114 pass (6 пре-существующих фейлов, доказано baseline-прогоном).
- Полный `npm test` (frontend): см. REVIEW_REPORT / итоговый комментарий PR.

## Риски / ограничения

- Кратность 10 применена к x-координатам нод и всем точкам петель; y нод определяется центровкой на Y0 (centerY == Y0 — явный пункт ТЗ), поэтому y может быть некратен 10 при Ø56/50×50.
- GAP между нодами после округления x может отличаться от ровно 100 на ≤4px (156→160).
- `viewportTopLimit` реализован в геометрии, но decorManager пока не передаёт реальную границу viewport — используется детерминированный порог `y < 40`.
- Локальный файловый RAG degraded: reindex падает OOM (exit 137, лимит Docker VM ~8.3G), поиск по существующему индексу пустой вывод — на контур не влияло (разведка по коду напрямую).

## Git proof

- branch: `feature/canvas-layout-canon` (ahead 3 of origin/main)
- HEAD: a5c5fb5b
- diffstat: canonLayout.js + тест (новые), BpmnStage.jsx, align-reset test, templatePackAdapter(+test), applyBpmnFragmentTemplatePlacement(+test), overlayLayoutModel(+новый тест), decorManager(+test), v2OverlayRenderer.test, 2 CSS.
