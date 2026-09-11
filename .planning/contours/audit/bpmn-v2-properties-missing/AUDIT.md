# AUDIT — «v2» BPMN-свойства не отображаются в сайдбаре «Дополнительные BPMN-свойства»

**contour:** `audit/bpmn-v2-properties-missing`  
**branch:** `audit/bpmn-v2-properties-missing` (от `new-origin/main` после ff)  
**stage:** `clearvestnic.ru:5177`  
**дата аудита:** 2026-06-29  
**продуктовый код не изменялся.**

---

## 1. Что такое «v2 свойства»

В контексте диаграммы ProcessMap «v2 свойства» — это BPMN-расширения (`camunda:property`, `zeebe:property` и другие `extensionElements`), которые визуально показываются на канвасе в виде:

- V2-оверлейных карточек (`fpc-overlay-v2`, `fpc:overlay:*`);
- property-card над задачей при включённом флаге `fpc-show-properties`;
- цветных бейджей с ключом/значением.

Источник для этих оверлеев — **живой BPMN modeler / XML**: `businessObject.extensionElements`.

Блок сайдбара **«Дополнительные BPMN-свойства»** — это редактор тех же самых extension-свойств, но он читает их из другого источника: **`bpmn_meta.camunda_extensions_by_element_id`**.

---

## 2. Где рисуется блок сайдбара

Файл `frontend/src/components/sidebar/ElementSettingsControls.jsx`:

- Строки ~1137–1153: `additionalBpmnRows` строятся из `extensionStateDraft` → `dictionaryEditorModel.customRows` / `visibleFallbackProperties`.
- Строки ~1996–2047: сам аккордеон «Дополнительные BPMN-свойства».

`extensionStateDraft` приходит сверху из `NotesPanel.jsx`:

```jsx
extensionStateDraft={isElementMode ? camundaPropertiesDraft : createEmptyCamundaExtensionState()}
```

`camundaPropertiesDraft` инициализируется из `selectedCamundaExtensionEntry`, который берётся **только** из `draft.bpmn_meta.camunda_extensions_by_element_id` (`NotesPanel.jsx`, строки ~1202–1210, ~1372–1375).

Файл `frontend/src/features/process/camunda/propertyDictionaryModel.js` (`rawExtensionPropertyRows`) читает ровно `state.properties.extensionProperties` — т.е. ту же нормализованную копию из `bpmn_meta`.

---

## 3. Почему свойства есть на канвасе, но нет в сайдбаре

Есть две независимые цепочки данных:

| Источник | Что читает | Кто пишет | Проблема |
|---|---|---|---|
| **BPMN XML / modeler** `extensionElements` | V2 overlay parser, property-card, бейджи | overlay context-menu, внешние BPMN-файлы, импорт | Свойства могут существовать в XML, но отсутствовать в `bpmn_meta` |
| **`bpmn_meta.camunda_extensions_by_element_id`** | Сайдбар «Дополнительные BPMN-свойства», registry | sidebar save flow, `property_save_service.py` | Сайдбар не видит XML-only свойства |

### 3.1. Гидратация при загрузке сессии отсекает XML-свойства

`frontend/src/App.jsx`, `sessionToDraft`, строки ~412–418:

```js
const rawBpmnMetaCamunda = ensureObject(next.bpmn_meta).camunda_extensions_by_element_id;
const camundaFieldIsPresent = rawBpmnMetaCamunda !== null && rawBpmnMetaCamunda !== undefined;
const camundaHydration = hydrateCamundaExtensionsFromBpmn({
  extractedMap: xmlCamundaExtensions,
  sessionMetaMap: normalizedMeta.camunda_extensions_by_element_id,
  allowSeedFromBpmn: !camundaFieldIsPresent,
});
```

- Если в `bpmn_meta` уже есть ключ `camunda_extensions_by_element_id` (даже пустой объект `{}`), `allowSeedFromBpmn === false`.
- `hydrateCamundaExtensionsFromBpmn` в `frontend/src/features/process/camunda/camundaExtensions.js` при `allowSeedFromBpmn === false` полностью игнорирует XML-свойства.
- На практике ключ `camunda_extensions_by_element_id` присутствует почти во всех рабочих сессиях, потому что любое сохранение свойств через сайдбар пишет в него.

**Следствие:** свойства, добавленные в BPMN-XML вне сайдбара (импорт, внешний редактор, V2 overlay), не попадают в `bpmn_meta` и не показываются в сайдбаре.

### 3.2. V2 overlay context-menu мутирует modeler, но не `bpmn_meta`

Файл `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js`:

- `readExtensionPropertiesFromElement` читает `businessObject.extensionElements`.
- `updateExtensionPropertyValue` меняет значение прямо в modeler (`modeling.updateProperties(element, { extensionElements: nextExt })`) и возвращает `{ ok: true }`.
- Ни одна из этих функций не обновляет `draft.bpmn_meta.camunda_extensions_by_element_id`.

Сайдбар, получая `extensionStateDraft` только из `bpmn_meta`, не увидит изменение.

### 3.3. Property-save-decomposition усугубляет рассинхронизацию

`frontend/src/App.jsx`, `setElementCamundaExtensions`, строка ~2620:

```js
const persistResult = await persistCamundaExtensionsViaCanonicalXmlBoundary({
  ...,
  forceMetaPatch: true,
  ...
});
```

`frontend/src/features/process/camunda/camundaExtensionsSaveBoundary.js`:

- `forceMetaPatch: true` заставляет сохранение идти по **meta-only** пути через `apiPatchSessionProperties` / `apiPatchSessionMeta`.
- BPMN XML на сервере не перезаписывается.
- Локальный `draft.bpmn_xml` тоже не обновляется новыми свойствами.

Таким образом:
- сайдбар пишет в `bpmn_meta`, но не в XML;
- overlay/V2 пишет в XML/modeler, но не в `bpmn_meta`;
- оба источника расходятся, и сайдбар показывает лишь ту половину, что лежит в `bpmn_meta`.

---

## 4. Файлы, участвующие в баге

| Файл | Роль |
|---|---|
| `frontend/src/components/sidebar/ElementSettingsControls.jsx` | Рендерит блок «Дополнительные BPMN-свойства» из `extensionStateDraft` |
| `frontend/src/components/sidebar/useElementSettingsController.js` | Управляет `extensionStateDraft`, знает только `properties.extensionProperties` |
| `frontend/src/components/NotesPanel.jsx` | Инициализирует `camundaPropertiesDraft` из `bpmn_meta` |
| `frontend/src/features/process/camunda/propertyDictionaryModel.js` | Строит `customRows`/`visibleRows` из `extensionState.properties.extensionProperties` |
| `frontend/src/App.jsx` | `sessionToDraft` — гидратация с `allowSeedFromBpmn: !camundaFieldIsPresent` |
| `frontend/src/features/process/camunda/camundaExtensions.js` | `hydrateCamundaExtensionsFromBpmn`, `extractCamundaExtensionsMapFromBpmnXml` |
| `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js` | Overlay context-menu: читает и мутирует `extensionElements`, не трогает `bpmn_meta` |
| `frontend/src/features/process/camunda/camundaExtensionsSaveBoundary.js` | `persistCamundaExtensionsViaCanonicalXmlBoundary` с `forceMetaPatch` |
| `backend/app/save_services/property_save/property_save_service.py` | Сохраняет только `bpmn_meta_json`, не парсит XML |
| `backend/app/_legacy_main.py` | `session_bpmn_save` использует incoming `bpmn_meta`, не реэкстрагирует свойства из XML |

---

## 5. Воспроизведение (текстовый сценарий)

1. Открыть сессию, в которой у любого элемента уже есть хотя бы одно Camunda-свойство, сохранённое через сайдбар (чтобы `bpmn_meta.camunda_extensions_by_element_id` существовал).
2. Добавить в BPMN-XML этого элемента ещё одно свойство:
   ```xml
   <camunda:property name="v2-ingredient" value="sugar" />
   ```
   либо изменить свойство через V2 overlay context-menu.
3. Перезагрузить страницу (или дождаться автосейва).
4. На канвасе V2 overlay/property-card покажет новое свойство.
5. Открыть сайдбар элемента → «Дополнительные BPMN-свойства» → нового свойства нет.

---

## 6. Возможные направления исправления (без выбора)

**A. Обратная синхронизация XML → meta**
После любого изменения `extensionElements` в modeler (overlay edit, BPMN save) извлекать `camunda:properties` и мержить их в `bpmn_meta.camunda_extensions_by_element_id`.

**B. Сайдбар читает из modeler**
При выборе элемента `extensionStateDraft` формировать из live `businessObject.extensionElements`, а не только из `bpmn_meta`, сохраняя возможность редактирования через существующий save flow.

**C. Разрешить XML-гидратацию всегда**
Убрать условие `allowSeedFromBpmn: !camundaFieldIsPresent` и всегда мержить недостающие XML-свойства в meta. Требует чёткой политики при конфликтах (session wins vs XML wins).

**D. Вернуть канонический XML-boundary для property save**
Отказаться от `forceMetaPatch: true` для свойств, чтобы sidebar снова писал и в XML, и в meta, сохраняя единый источник правды.

**E. Реэкстракция на бэкенде**
`session_bpmn_save` при получении XML пересобирать `camunda_extensions_by_element_id` из XML и обновлять `bpmn_meta_json`. Это сделает XML первичным источником.

Конкретное решение должно быть выбрано продуктовым владельцем/conductor'ом и записано в `SOLUTION.md`.

---

## 7. Риски

- Любое исправление касается источника правды для Camunda-свойств; ошибка может привести к потере или дублированию свойств.
- Property-save-decomposition ввёл meta-only путь намеренно (убрать тяжёлый `PUT /bpmn` для каждого свойства). Возврат к XML-boundary ударит по производительности.
- V2 overlay и сайдбар сейчас используют разные нормализации (`bpmnOverlayParser.js` vs `propertyDictionaryModel.js`); унификация потребует согласования дедупликации и фильтрации meta-свойств.
