# Аудит синхронизации оверлея и сайдбара после property-only save

**Ветка:** `fix/sidebar-camunda-redesign-variant-a`  
**Окружение:** `clearvestnic.ru:5177` / `clearvestnic.ru:8011`  
**Образец:** проект `91f7fd5a0e`, org `org_default`  
**Дата аудита:** 2026-07-07

## 1. Что проверялось

После фикса гонки в `transformPersistedXml` нужно было проверить, не возникает ли расхождения между состоянием сайдбара и V2-оверлея при:
- сохранении отдельного свойства из сайдбара (per-property save);
- сохранении сессии через координатор (`Ctrl+S` / coordinator flush);
- пустых значениях свойств.

Проверены гипотезы A–E из запроса.

## 2. Методология

1. Инспекция кода путей сохранения и отрисовки.
2. Playwright-проба с перехватом тел PUT `/api/sessions/:id/bpmn`.
3. Сравнение источников данных сайдбара и оверлея.

## 3. Вердикт по гипотезам

### A. Оверлей читает из `bpmnModeler`, сайдбар — из React-state / dictionary model

**Вердикт:** частично верно архитектурно, но не является причиной расхождения после сохранения.

- Сайдбар: `useElementSettingsController` → `setSchemaPropertyValueInExtensionState` → `onSetElementCamundaExtensions` → `saveBpmnState`. Для отображения используется `getElementCamundaExtensionsFromModeler(selectedElementId)` с зависимостью от `bpmnModelerSyncEpoch` (`NotesPanel.jsx:1406-1411`).
- V2-оверлей: `overlayLifecycleManager.mountFromBpmn` → `extractOverlaysFromBpmn` → читает `businessObject.extensionElements` напрямую из живого modeler (`bpmnOverlayParser.js`).

Источники действительно разные, но перед сохранением `App.jsx:2645` вызывает `applyElementCamundaExtensionsToModeler`, который мутирует modeler синхронно, поэтому оба источника видят одно и то же значение.

### B. Per-property save шлёт старый XML / старую `bpmnMeta`

**Вердикт:** не воспроизводится после фикса.

- `App.jsx:2645` обновляет modeler до вызова `saveBpmnState`.
- `saveBpmnState.js:207` строит `nextXml` через `buildCanonicalXml` из актуального `nextCamundaExtensionsByElementId`.
- Координатор получает `xmlOverride` и `bpmnMeta` (`createBpmnCoordinator.js:500-507`) и передаёт их в `transformPersistedXml` как `explicitMeta`, переопределяя stale `draftRef.current.bpmn_meta`.
- Playwright-перехват показал, что итоговый PUT содержит `after-save`, а сервер возвращает то же значение после reload.

Старый `before-save` может встречаться как отдельный in-flight autosave, начатый до клика «Сохранить всё», но он не перезаписывает итоговое состояние благодаря CAS и тому, что `flushSave` дожидается завершения текущих сохранений.

### C. Сайдбар фильтрует пустые schema-значения, а оверлей — нет

**Вердикт:** подтверждено, это реальная проблема.

- В сайдбаре `visibleSchemaRows` фильтрует пустые значения:
  ```js
  const visibleSchemaRows = Array.isArray(dictionaryEditorModel?.schemaRows)
    ? dictionaryEditorModel.schemaRows.filter((row) => String(row?.value ?? "").trim() !== "")
    : [];
  ```
  (`ElementSettingsControls.jsx:1183-1185`)

- Legacy-оверлей (`derivePropertiesOverlayRows`) тоже фильтрует пустые значения:
  ```js
  if (model.hasSchema) {
    asArray(model.schemaRows).forEach((row) => {
      const value = String(row?.value ?? "");
      if (!asText(value)) return;
      ...
    });
  }
  ```
  (`propertyDictionaryModel.js:294-303`)

- V2-оверлей (`bpmnOverlayParser.js:303-318`) генерирует auto-карточку, если `realProps.length > 0`, при этом `realProps` не фильтруется по значению:
  ```js
  const realProps = cleanProps.filter((p) => !isOverlayMetaProperty(p.name));
  if (realProps.length) {
    const firstKey = String(realProps[0]?.name || "").trim();
    const titleText = String(elementName || firstKey || "Properties").trim();
    return { ..., text: titleText, auto: true, ... };
  }
  ```

Итог: schema-свойство с пустым значением исчезает из сайдбара и из legacy-оверлея, но V2 auto-overlay продолжает рисовать карточку с пустой строкой. Это и есть нарушение «One Truth».

### D. `saveBpmnState` для property-only использует другой XML-builder, чем coordinator

**Вердикт:** не является причиной рассинхронизации.

- Per-property путь: `saveBpmnState` → `buildCanonicalXml` из свежего `getModelerXml` + `nextCamundaExtensionsByElementId`.
- Coordinator путь: `doFlush` → `runtime.getXml()` + `preparePersistedXml`.
- Оба пути сходятся на одном и том же живом modeler и на одном `transformPersistedXml` (после фикса с explicit `bpmnMeta`).
- Разница только в том, что per-property сохранение явно передаёт XML, а coordinator сериализует его сам. Значения получаются идентичными.

### E. После property save не бампается `bpmnModelerSyncEpoch`

**Вердикт:** не верно.

- `App.jsx:2648` увеличивает `bpmnModelerSyncEpoch` сразу после `applyElementCamundaExtensionsToModeler` и до вызова `saveBpmnState`:
  ```js
  bpmnStageRef.current?.applyElementCamundaExtensionsToModeler?.(elementId, extensionStateRaw);
  setBpmnModelerSyncEpoch((e) => e + 1);
  ```
- Это заставляет сайдбар перечитать расширения из modeler до сохранения и после.

## 4. Корневая причина

V2 auto-overlay не применяет тот же фильтр пустых значений, который применяют:
- сайдбар (`visibleSchemaRows`);
- legacy-оверлей (`derivePropertiesOverlayRows`).

Файл: `frontend/src/components/process/utils/bpmnOverlayParser.js`, функции `parseOverlayFromProperties` и `extractOverlaysFromBpmn`.

## 5. Рекомендуемый фикс

1. В `parseOverlayFromProperties` при генерации auto-overlay использовать только свойства с непустым значением.
2. В `extractOverlaysFromBpmn` при формировании `businessProperties` для V2-карточки отфильтровывать пустые значения.
3. Добавить юнит-тест: элемент с одним schema-свойством `value=""` не должен порождать auto-overlay, а элемент с пустым и непустым свойством должен показывать только непустое.

Это выровняет V2-оверлей с сайдбаром и legacy-оверлеем без изменения бизнес-логики свойств.

## 6. Применённый фикс

- `frontend/src/components/process/utils/bpmnOverlayParser.js`
  - `parseOverlayFromProperties`: auto-overlay теперь строится только по свойствам с непустым значением (`visibleProps`).
  - `extractOverlaysFromBpmn`: в `businessProperties` для V2-карточки отфильтровываются пустые значения.
- `frontend/src/components/process/utils/bpmnOverlayParser.test.mjs`
  - Добавлены 4 теста, покрывающие пустые значения в auto-overlay и V2 business properties.

## 7. Результаты проверки

```bash
cd /opt/processmap-test/frontend
node --test src/components/process/utils/bpmnOverlayParser.test.mjs
# 14/14 passed

node --test src/features/process/save/saveBpmnState.property-pipeline.test.mjs
# 3/3 passed

# E2E round-trip property save (production, до деплоя фикса):
cd /root/ui_verify && node audit_overlay_sidebar.mjs
# sidebar schema = after-save, overlay text = after-save, server XML = after-save
```

Фикс готов к коммиту/деплою.
