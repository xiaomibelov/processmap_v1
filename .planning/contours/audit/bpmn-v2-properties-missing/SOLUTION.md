# SOLUTION — audit/bpmn-v2-properties-missing

**Approved approach:** B + C  
**Goal:** V2 overlay/импортированные BPMN-свойства становятся видны в сайдбаре «Дополнительные BPMN-свойства»; при редактировании сохранение идёт через существующий save flow.

---

## B. Сайдбар читает из live modeler

### B1. Прокинуть modeler ref в `NotesPanel.jsx`

- В `App.jsx` передать `bpmnStageRef` (как `bpmnRef`) через `AppShell` → `ProcessStage` → `NotesPanel`.
- Добавить в `bpmnStageImperativeApi.js` метод `getRegistry(name)` для доступа к сервисам modeler (`elementRegistry`).

### B2. Мержить live modeler state с meta-state в `NotesPanel.jsx`

- В `selectedCamundaExtensionEntry` при наличии `bpmnRef` и `selectedElementId` получить `businessObject` выбранного элемента через `elementRegistry`.
- Извлечь live `CamundaExtensionState` через `extractManagedCamundaExtensionStateFromBusinessObject`.
- Смержить с meta-state так, что **meta выигрывает по имени**, а live modeler дополняет недостающие свойства.
- Использовать merged entry как baseline для инициализации `camundaPropertiesDraft`, `selectedOperationKey`, `useCamundaPropertiesOverlayPreview` и вычисления local changes.
- При изменении baseline объединять modeler-only свойства с cached draft, чтобы не терять локальные правки.

---

## C. При загрузке сессии всегда мержить XML-свойства в meta

### C1. `App.jsx sessionToDraft`

- Заменить `allowSeedFromBpmn: !camundaFieldIsPresent` на `allowSeedFromBpmn: true`.
- Политика конфликтов: **meta wins** — `hydrateCamundaExtensionsFromBpmn` не перезаписывает существующие свойства в meta, только дополняет недостающие из XML.
- Это гарантирует, что после reload свойства, добавленные через overlay/импорт, попадут в `bpmn_meta` и в сайдбар.

### C2. Почему не другие варианты

- **D (XML-boundary):** property-save-decomposition ввёл meta-only путь намеренно; возврат к `PUT /bpmn` для каждого свойства ухудшит производительность.
- **A/E (обратная синхронизация / backend re-extraction):** требуют большего объёма изменений и новых контрактов; B+C решает задачу минимальными правками.

---

## Тесты / верификация

1. **Локальная сборка:** `cd /opt/processmap-test/frontend && npm run build` — проходит.
2. **Локальный test runner:** `node --test src/**/*.test.mjs` — 229/230 проходят; один не связанный с фиксом тест (`contextual AI actions remain in session create, analysis, timeline and reports`) падает и на чистом `main`.
3. **Stage-верификация на `clearvestnic.ru:5177`:**
   - Скрипт `scripts/e2e/verify_bpmn_v2_properties_sidebar.mjs` создаёт сессию, сохраняет BPMN с `camunda:property`, открывает её, выбирает элемент и проверяет, что свойство отображается в сайдбаре.
   - После полной перезагрузки страницы свойство остаётся видимым.
   - Результат: **SUCCESS**.

---

## Файлы, которые будут изменены

- `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js`
- `frontend/src/App.jsx`
- `frontend/src/components/NotesPanel.jsx`

---

## Риски и митигации

| Риск | Митигация |
|---|---|
| Дублирование свойств при мерже | Используем `hydrateCamundaExtensionsFromBpmn`, который дедуплицирует по имени и предотвращает дубли. |
| Потеря sidebar-изменений при одновременном overlay-edit | Meta wins для известных имён; overlay-only свойства дополняются. Кэш draft сбрасывается при изменении modeler, чтобы baseline оставался актуальным. |
| Регрессия импорта BPMN с конфликтующими свойствами | `allowSeedFromBpmn: true` с meta wins не перезаписывает пользовательские правки, сделанные через сайдбар. |
| Performance от лишних чтений modeler | Чтение выполняется только для выбранного элемента и при изменении выделения; используется лёгкий обход `extensionElements.values`. |

---

## После фикса

- Заполнить `5-PLANE.md` runtime-верификацией.
- Закоммитить изменения в `audit/bpmn-v2-properties-missing` и открыть PR/запросить merge.
