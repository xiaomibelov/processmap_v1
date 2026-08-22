# STATE_DIVERGENCE.md — form vs modeler vs backend vs snapshot

## Участники state

| Слой | Что хранит | Когда обновляется |
|---|---|---|
| **Property panel form** | `extensionStateDraft` в `useElementSettingsController` | При каждом изменении input |
| **NotesPanel canonical** | `finalizedCamundaPropertiesDraftCanonical` | При изменении draft |
| **bpmn-js modeler** | `businessObject.extensionElements` | При загрузке (через `finalizeCamundaExtensionsXml`) и при context-menu overlay actions |
| **Frontend session draft** | `draft.bpmn_meta.camunda_extensions_by_element_id` | После `onSessionSync` (background refresh, fallback patch) |
| **Backend DB** | `sessions.bpmn_meta_json` | После успешного `PUT /api/sessions/{sid}/bpmn` |
| **BPMN XML blob** | `sessions.bpmn_xml` | Перезаписывается при каждом property save |
| **BPMN version snapshot** | `bpmn_versions` table | Создаётся при каждом `session_bpmn_save` |

## Типичный happy path

1. Загрузка: DB `bpmn_meta` → `finalizeCamundaExtensionsXml` → modeler XML → property panel показывает актуальные значения.
2. Пользователь меняет property → `extensionStateDraft` обновляется.
3. Save → boundary строит новый XML, PUT → DB обновляет `bpmn_meta` и `bpmn_xml`.
4. `onDurableSaveAck` + background refresh обновляет `draft` в App.

## Возможные рассинхронизации

### 1. Form vs DB
- **Симптом:** изменения остались в форме, но после F5 пропали.
- **Причина:** save упал (409/423/500), форма не сбросила draft.
- **Расположение в коде:** `NotesPanel.jsx:2548-2552` — `result.ok === false` не сбрасывает `camundaPropertiesDraft`.

### 2. Modeler vs DB
- **Симптом:** на canvas/properties overlay видно старое значение, в property panel — новое.
- **Причина:** context-menu overlay мутирует modeler напрямую (`modeling.updateProperties`), но не обновляет `bpmn_meta`. Автосейв затем может перезаписать XML без учёта overlay-изменений или наоборот.
- **Расположение:** `executeBpmnContextMenuAction.js`, `BpmnStage.jsx` autosave coordinator.

### 3. Draft vs Server version
- **Симптом:** любой save properties возвращает 409 даже при отсутствии других изменений.
- **Причина:** `setElementCamundaExtensions` берёт `baseDiagramStateVersion` из `draft?.diagram_state_version`, который отстаёт от сервера (например, из-за незавершённого background refresh).
- **Расположение:** `App.jsx:2569-2574`.

### 4. Snapshot vs current state
- **Симптом:** в истории версий (bpmn_versions) properties есть, но в текущей форме — нет.
- **Причина:** версии создаются при каждом успешном PUT. Если property save не дошёл до сервера, snapshot не создаётся. Если дошёл, но background refresh не обновил draft, форма показывает старое.

### 5. Preserved unmanaged fragments
- **Симптом:** пропадают connector/extension elements, которые не управляются property panel.
- **Причина:** `finalizeCamundaExtensionsXml` пытается сохранить unmanaged fragments по сигнатурам; при коллизии signature singleton может выкинуть нужный фрагмент.
- **Расположение:** `camundaExtensions.js:1728-1744`.

## Кто побеждает при конфликте

| Конфликт | Победитель |
|---|---|
| `bpmn_meta` vs imported XML properties | `bpmn_meta` (session wins) |
| Local draft vs server response | server response (через `onSessionSync`) |
| Property panel vs context-menu overlay | зависит от порядка autosave / property save |
| Property save 409 retry | свежий server state + user changes |

## Рекомендация по диагностике

Добавить временное логирование в `NotesPanel.saveSelectedCamundaProperties`:
```js
console.log("[PROP_SAVE] baseVersion", baseDiagramStateVersion, "draft", draft);
```
и в `persistCamundaExtensionsViaCanonicalXmlBoundary`:
```js
console.log("[PROP_BOUNDARY] currentXml length", currentXml.length, "nextXml changed", nextXml !== currentXml, "put status", saveRes?.status);
```
Это позволит определить, на каком слое происходит рассинхронизация.
