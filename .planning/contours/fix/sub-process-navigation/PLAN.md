# PLAN — fix/sub-process-navigation (BUG-SUB-001)

## Bug
При клике на `bpmn:CallActivity` / sub-process на BPMN-диаграмме не происходит проваливания (drill-down) в child sub-process.

## Root cause
- Изначально обработчик навигации был подключён только на двойной клик (`element.dblclick`).
- После первой итерации исправления перешли на одиночный клик, но обработчик `element.click` был зарегистрирован **только для viewer**, тогда как рабочий canvas в редакторе использует **modeler** (`bpmn-js/lib/Modeler`).
- В некоторых окружениях событие `element.click` могло не доходить до обработчика из-за overlay/selection pipeline.

## Scope
Bounded contour: только subprocess drill-down из canvas. Не трогаем оверлеи, аналитику, сохранение, product actions.

## Fix plan
1. Вынести подписку на `element.click` для `bpmn:CallActivity` в общий хелпер `bindSubprocessNavigationEvents`.
2. Вызвать хелпер при инициализации **и viewer, и modeler** в `BpmnStage.jsx`.
3. Подписаться с приоритетом `3000`, чтобы клик не терялся среди обработчиков selection.
4. Добавить **native DOM click fallback** на canvas-контейнере для надёжности.
5. Добавить CSS-класс `fpc-call-activity-clickable` + `cursor: pointer` для визуальной обратной связи.
6. Добавить opt-in debug-логирование для диагностики в браузере.
7. Добавить e2e-тест на Playwright: клик по CallActivity → переход к child session.

## Acceptance criteria
- [x] Одиночный клик на CallActivity / SubProcess в canvas открывает subprocess-сессию.
- [x] Контекстное меню элемента содержит пункт "Перейти в подпроцесс" для CallActivity и SubProcess.
- [x] В модальном превью подпроцесса отображается кнопка "Перейти в подпроцесс".
- [x] URL меняется на `?project=...&session=<child>&parent=<root>&focus=<target>`.
- [x] Backend unit tests проходят (`test_subprocess_navigation.py`, `test_bpmn_navigation_helpers.py`, `test_session_read_rbac.py`).
- [x] Frontend production build собирается без ошибок.
- [x] Playwright e2e проходит на http://clearvestnic.ru:5177.

## Files to change
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js`
- `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`
- `frontend/src/features/process/bpmn/context-menu/schema/bpmnContextMenuSchemas.js`
- `frontend/src/features/process/bpmn/context-menu/bpmnContextMenuActionMatrix.js`
- `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js`
- `frontend/src/features/process/bpmn/context-menu/BpmnSubprocessPreviewModal.jsx`
- `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js`
- `scripts/e2e/check_subprocess_click.mjs`

## Tests
- Backend: `python3 -m pytest tests/test_subprocess_navigation.py tests/test_bpmn_navigation_helpers.py tests/test_session_read_rbac.py -q`
- Frontend build: `npm run build`
- E2E: `node scripts/e2e/check_subprocess_click.mjs`

## Risks / Notes
- CallActivity и SubProcess в BPMN — разные типы. Навигация поддерживается для обоих: `bpmn:CallActivity` (calledElement) и `bpmn:SubProcess` (встроенный подпроцесс).
- Одиночный клик уже используется для selection; приоритет 3000 гарантирует, что навигация сработает, не мешая выделению.
- Native fallback в capture phase обходит возможные проблемы с event propagation.
- Другие BPMN-ссылки (sequence/message flow, ассоциации) не являются триггерами навигации.
