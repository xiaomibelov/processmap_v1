# fix(subprocess-navigation): drill-down по клику на CallActivity (BUG-SUB-001)

## Что сломано
При клике на элемент `bpmn:CallActivity` (sub-process / вызов подпроцесса) на BPMN-диаграмме не происходило проваливания в child sub-process. Пользователь кликал один раз, но навигация не срабатывала.

## Почему
1. Изначально переход был привязан только на двойной клик (`element.dblclick`).
2. После первого hotfix перешли на одиночный клик (`element.click`), но обработчик был зарегистрирован **только для viewer** (`bpmn-js/lib/NavigatedViewer`), а рабочий canvas в редакторе использует **modeler**. В итоге клик по CallActivity не вызывал навигацию.
3. В некоторых окружениях событие `element.click` могло не доходить из-за overlay/selection pipeline.

## Как исправлено
- Вынесена общая функция `bindSubprocessNavigationEvents`:
  - Подписывается на `element.click` с приоритетом `3000` (выше стандартного selection-обработчика).
  - Фильтрует только `bpmn:CallActivity`.
  - Вызывает `onNavigateToSubprocess(elementId)`.
  - Добавляет CSS-класс `fpc-call-activity-clickable` к SVG-группе элемента после рендера.
  - **Native DOM click fallback**: слушает клик на canvas-контейнере в фазе capture, определяет элемент по `.djs-element` и `elementRegistry`, и тоже вызывает навигацию для CallActivity.
- Хелпер вызывается при инициализации **и viewer, и modeler** в `BpmnStage.jsx`.
- Добавлен `cursor: pointer` для CallActivity.
- Добавлено opt-in debug-логирование: `window.__FPC_DEBUG_SUBPROCESS__ = true` или `localStorage.fpc_debug_subprocess = 1`.

## Файлы
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js` (новый)
- `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`
- `scripts/e2e/check_subprocess_click.mjs` (новый)

## Как проверить
### Backend
```bash
cd backend
.venv/bin/python -m pytest tests/test_subprocess_navigation.py tests/test_bpmn_navigation_helpers.py tests/test_session_read_rbac.py -q
# 29 passed
```

### Frontend build
```bash
cd frontend
npm run build
# ✓ built
```

### E2E (Playwright)
```bash
# из /root (где доступен playwright-core):
cp /opt/processmap-test/scripts/e2e/check_subprocess_click.mjs /root/scripts/e2e/
cd /root
node scripts/e2e/check_subprocess_click.mjs
# Ожидаемый результат: SUCCESS и URL с child session
```

### Вручную на тестовом стенде
1. Открыть http://clearvestnic.ru:5177.
2. Залогиниться как `admin@local` / `admin`.
3. Открыть проект `Playwright Subprocess Test` → сессию `Root Process`.
4. Кликнуть один раз на CallActivity `Open Subprocess`.
5. Должна открыться child-сессия `Подпроцесс: Process_sub`, URL должен содержать `session=547f33d6ea&parent=4fe9e94289&focus=SubTask_1`.

### Диагностика в браузере
Если вручную не работает, откройте DevTools → Console и выполните:
```js
window.__FPC_DEBUG_SUBPROCESS__ = true;
localStorage.setItem("fpc_debug_subprocess", "1");
```
Затем кликните на CallActivity — в консоли появятся строки `[SUBPROCESS_NAV] ...`. Пришлите их.

## Deploy
- Уже задеплоено на тестовый стенд: http://clearvestnic.ru:5177 (commit `df7a6bd6`).
- После merge можно деплоить на stage.

## Связь с J-4
J-4 («Переход к элементу в подпроцессе») — смежная задача фокуса на target element после перехода. В этом контуре фокус (`focus=SubTask_1`) уже передаётся в URL и восстанавливается через `window.__SUBPROCESS_FOCUS_ELEMENT_ID__`; отдельная доработка J-4, если требуется, вне bounded scope.
