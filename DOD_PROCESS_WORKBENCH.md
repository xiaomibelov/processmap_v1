# DOD Process Workbench

Документ фиксирует Definition of Done для 4 веток: UI, AI, BPMN runtime, Versions.  
Проверки опираются на текущие модули и телеметрию приложения, без изменения API-контрактов.

## Опорные модули (реальные точки контроля)
- Табы, toolbar, модалка Versions, ручной snapshot/restore: `frontend/src/components/ProcessStage.jsx:887`, `frontend/src/components/ProcessStage.jsx:1003`, `frontend/src/components/ProcessStage.jsx:316`
- Оркестрация tab switch, flush/fetch/seed, pending replay: `frontend/src/features/process/hooks/useProcessTabs.js:552`, `frontend/src/features/process/hooks/useProcessTabs.js:655`
- BPMN runtime UI-слой, ensureVisible, commandStack.changed, XML enter: `frontend/src/components/process/BpmnStage.jsx:1241`, `frontend/src/components/process/BpmnStage.jsx:3335`, `frontend/src/components/process/BpmnStage.jsx:3994`
- Runtime/Coordinator/Persistence: `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js:166`, `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js:147`, `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js:249`
- Snapshot storage/list/save/prune: `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js:284`, `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js:308`, `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js:559`
- AI run + attach + persist: `frontend/src/components/process/interview/useInterviewActions.js:589`, `frontend/src/features/process/hooks/useInterviewSyncLifecycle.js:123`
- Notes/left panel отображение вопросов выбранного элемента: `frontend/src/components/NotesPanel.jsx:155`

## A) UI DoD

### Функционально
- Header и tab navigation стабильны на desktop/mobile, переключение `Interview/Diagram/XML` без залипаний.
- В `ProcessStage` tab controls имеют корректные роли и состояния: `role="tablist"`, `role="tab"`, `aria-selected`, `tabIndex` (`frontend/src/components/ProcessStage.jsx:887`).
- Модалки (`Versions`, AI tools) визуально и по кликам находятся поверх рабочей зоны, действия в footer доступны и не блокируются canvas overlay (`frontend/src/components/ProcessStage.jsx:1003`, `frontend/src/components/TopBar.jsx:201`).
- Кнопки `Save/Export/Import/Versions` кликабельны и не ломают layout при длинных заголовках/ID.

### Регрессии/инварианты
- После любого switch табов активный таб один, состояние не «двоится», `isSwitchingTab/isFlushingTab` не залипают.
- Переключение в `Interview` не размонтирует BPMN runtime с потерей контекста при возврате.
- `TAB_PENDING` возможен кратковременно, но завершается `TAB_PENDING_REPLAY` и успешным `TAB_SET`.

### Обязательные e2e (spec)
- `frontend/e2e/tab-transition-matrix-big.spec.mjs`
- `frontend/e2e/tab-transition-matrix.spec.mjs`
- `frontend/e2e/interview-xml-diagram-tabchain.spec.mjs`

### Логи/телеметрия
- Включить флаги: `fpc_debug_tabs=1`, `fpc_debug_bpmn=1`, `fpc_debug_trace=1`.
- Должны появляться строки: `[TAB_SET]`, `[TABS] switch ... phase=start|done`, `[FPC TRACE] tabs.switch_start`, `[FPC TRACE] tabs.switch_done`.
- Не должны появляться в штатном прогоне: бесконечная серия `[TAB_PENDING] ... reason=not_ready`, отсутствие `TAB_SET` после клика по табу.

### Запрещено
- Ломать a11y-атрибуты табов и keyboard navigation.
- Делать модалки некликабельными из-за overlay/z-index.
- Возвращать автопереключение на другой таб без явного действия пользователя.

## B) AI DoD

### Функционально
- После нажатия AI в Interview пользователь сразу видит понятный прогресс (`opening/loading/success/error`) и итоговый статус (`frontend/src/components/process/interview/useInterviewActions.js:640`).
- Генерация вопросов привязана к конкретному шагу/элементу, вопросы сохраняются в `interview.ai_questions` и `interview.ai_questions_by_element` (`frontend/src/components/process/interview/useInterviewActions.js:854`, `frontend/src/components/process/interview/useInterviewActions.js:473`).
- Патч в backend сохраняет `ai_questions_by_element` без потери существующих данных (`frontend/src/features/process/hooks/useInterviewSyncLifecycle.js:135`).
- В `NotesPanel` для выбранного элемента отображается список AI-вопросов и статус/комментарий (`frontend/src/components/NotesPanel.jsx:155`).

### Регрессии/инварианты
- AI не блокирует навигацию по табам (non-blocking flow).
- AI-вопросы не записываются в BPMN XML как storage.
- После reload/patch структура `ai_questions_by_element` не теряется и остается привязанной к `elementId`.

### Обязательные e2e (spec)
- `frontend/e2e/ai-button-opens-panel-and-shows-loading.spec.mjs`
- `frontend/e2e/ai-questions-attach-to-node-and-show-badge.spec.mjs`
- `frontend/e2e/ai-nonblocking-tabs.spec.mjs`

### Логи/телеметрия
- Включить флаги: `fpc_debug_ai=1`, при интеграционных проверках также `fpc_debug_bpmn=1`.
- Должны появляться строки: `[AI_UI] click`, `[AI_UI] loading phase=request_sent`, `[AI_UI] success` или `[AI_UI] error`, `[AI_ATTACH] attach_start`, `[AI_ATTACH] attach_done`, `[AI_PERSIST] patch_start`, `[AI_PERSIST] patch_done`.
- Не должны появляться в happy path: `[AI_UI] error`, `patch_done ok=0`.

### Запрещено
- Скрывать состояние выполнения AI (нет «магии» без статуса).
- Перезаписывать вопросы другого элемента при attach.
- Хранить AI-метаданные в BPMN XML/аннотациях как основной storage.

## C) BPMN Runtime DoD

### Функционально
- `importXML/saveXML/createDiagram` работают без «пустых» возвратов на нормальном сценарии (`frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js:166`, `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js:253`).
- `ensureVisible` восстанавливает видимость диаграммы после tab switch/reload (`frontend/src/components/process/BpmnStage.jsx:3335`).
- Сохранение уходит в `PUT /api/sessions/:id/bpmn`, статус `200`, локальный store и draft синхронизированы (`frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js:249`, `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js:272`).

### Регрессии/инварианты
- После каждого возврата на Diagram: `registryCount > 0` и `svgRect > 0`.
- При переходах `Interview/XML/Diagram` нет rollback BPMN hash к более старому состоянию.
- `viewbox.changed` (pan/zoom) не должен считаться структурной мутацией BPMN.

### Обязательные e2e (spec)
- `frontend/e2e/bpmn-roundtrip-big.spec.mjs`
- `frontend/e2e/tab-transition-matrix-big.spec.mjs`
- `frontend/e2e/interview-xml-diagram-no-rollback.spec.mjs`
- `frontend/e2e/bpmn-runtime-reliability.spec.mjs`

### Логи/телеметрия
- Включить флаги: `fpc_debug_bpmn=1`, `fpc_debug_tabs=1`, `fpc_debug_trace=1`.
- Должны появляться строки: `[BPMN] commandStack.changed`, `[ENSURE] start`, `[ENSURE] done ... result=ok`, `[XML_TAB_ENTER]`, `PERSIST_OK`.
- Не должны появляться в green-run: `[ENSURE] done ... result=failed_visible`, `[ENSURE] done ... result=failed_reset`, `MERGE_SKIP_EMPTY_BPMN_XML` при штатной цепочке с непустым BPMN (`frontend/src/App.jsx:323`).

### Запрещено
- Писать пустой XML в persist при готовом runtime.
- Ломать guards stale/session/epoch/container в `ensureVisible`.
- Допускать «тихий» rollback BPMN после interview patch/tab switch.

## D) Versions DoD

### Функционально
- После `PERSIST_OK` autosave snapshot вызывается и фиксирует новую версию при реальном изменении XML (`frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js:282`, `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js:299`).
- Manual snapshot (`Создать версию`) всегда создает новую запись, даже при одинаковом hash (`force=true`, `mode=manual`) (`frontend/src/components/ProcessStage.jsx:338`, `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js:315`).
- Список версий в UI показывает весь массив, корректный count, preview и restore работают после reload (`frontend/src/components/ProcessStage.jsx:296`, `frontend/src/components/ProcessStage.jsx:1033`).

### Регрессии/инварианты
- Ключ хранения включает `projectId + sessionId`: `snapshots:${projectId}:${sessionId}`.
- История ограничена `N` (по умолчанию 20), prune удаляет только самые старые (`frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js:312`, `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js:559`).
- Autosave может дедупить (`skip_same_hash/skip_same_rev`), manual checkpoint дедупить не должен.

### Обязательные e2e (spec)
- `frontend/e2e/manual-snapshots-accumulate.spec.mjs`
- `frontend/e2e/snapshot-versions-big-diagram-restore.spec.mjs`
- `frontend/e2e/reload-restores-from-snapshots.spec.mjs`
- `frontend/e2e/snapshot-versions-accumulate.spec.mjs`

### Логи/телеметрия
- Включить флаги: `fpc_debug_snapshots=1`, `fpc_debug_bpmn=1`, `fpc_debug_tabs=1`, `fpc_debug_trace=1`.
- Должны появляться строки: `PERSIST_OK`, `SNAPSHOT_TRY`, `SNAPSHOT_DECISION`, `SNAPSHOT_SAVED`, `UI_VERSIONS_LOAD`, `UI_SNAPSHOT_CLICK`, `UI_SNAPSHOT_RESULT`.
- Для manual snapshot должны быть `mode=manual force=1` и `reason=saved_new|pruned`.
- Для autosave допустимы `reason=skip_same_hash|skip_same_rev`.
- Не должны появляться в штатном прогоне: `reason=wrong_key`, массовые `reason=read_fail`, отсутствие роста `count` при серии ручных сохранений.

### Запрещено
- Хранить версии под фиксированным ID с перезаписью одной записи.
- Использовать ключ storage без `sessionId`.
- Показывать в UI только первую/последнюю запись вместо полного списка.
- Использовать BPMN аннотации как storage пользовательских метаданных.

## Команды проверки (build + 5 ключевых e2e)

```bash
cd frontend && npm run build

cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/tab-transition-matrix-big.spec.mjs --reporter=list
cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/bpmn-roundtrip-big.spec.mjs --reporter=list
cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/ai-button-opens-panel-and-shows-loading.spec.mjs --reporter=list
cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/manual-snapshots-accumulate.spec.mjs --reporter=list
cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/snapshot-versions-big-diagram-restore.spec.mjs --reporter=list
```

