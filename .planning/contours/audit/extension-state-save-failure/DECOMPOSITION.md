# DECOMPOSITION.md — bounded contexts и API между сервисами

## Текущий монолит

Всё проходит через `PUT /api/sessions/{sid}/bpmn`:

```
Property Panel
  ↓
App.jsx setElementCamundaExtensions
  ↓
camundaExtensionsSaveBoundary.js
  ↓
apiPutBpmnXml
  ↓
backend session_bpmn_save
  ↓
sessions.bpmn_xml + sessions.bpmn_meta_json
```

Property save и diagram save **конкурируют** за один и тот же lock и версию.

## Bounded contexts

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Bounded Contexts                             │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Property Editor (UI)                                              │
│    - ElementSettingsControls.jsx                                     │
│    - useElementSettingsController.js                                 │
│    - propertyDictionaryModel.js                                      │
│    Отвечает: форма, валидация, локальный draft.                      │
├─────────────────────────────────────────────────────────────────────┤
│ 2. Extension State Service                                           │
│    - CRUD camunda_extensions_by_element_id                           │
│    - Truth source JSON (не XML)                                      │
│    Отвечает: хранение instance-значений свойств.                     │
├─────────────────────────────────────────────────────────────────────┤
│ 3. BPMN Modeler Service                                              │
│    - bpmn-js canvas                                                  │
│    - XML import/export                                               │
│    Отвечает: канвас, commandStack, XML representation.               │
├─────────────────────────────────────────────────────────────────────┤
│ 4. Session Persistence Service                                       │
│    - save/load bpmn_xml                                              │
│    - diagram_state_version / CAS                                     │
│    Отвечает: долговременное хранение диаграммы.                      │
├─────────────────────────────────────────────────────────────────────┤
│ 5. Property Sync Service                                             │
│    - finalizeCamundaExtensionsXml                                    │
│    - hydrateCamundaExtensionsFromBpmn                                │
│    Отвечает: merge managed/unmanaged extension elements.             │
└─────────────────────────────────────────────────────────────────────┘
```

## API между контекстами (целевой вариант)

### Property Editor → Extension State Service

```http
PUT /api/sessions/{sid}/elements/{elementId}/extension-state
{
  "properties": {
    "extensionProperties": [...],
    "extensionListeners": [...]
  },
  "base_diagram_state_version": 123
}
```

Ответ:
```json
{
  "ok": true,
  "diagram_state_version": 124,
  "camunda_extensions_by_element_id": {...}
}
```

### Extension State Service → Property Sync Service (внутренний)

```
onExtensionStateChanged(sessionId, elementId, state)
  → generate canonical XML fragment for element
  → update BPMN Modeler businessObject
```

### BPMN Modeler → Session Persistence

```http
PUT /api/sessions/{sid}/bpmn
{
  "xml": "<bpmn:definitions>...</bpmn:definitions>",
  "base_diagram_state_version": 124
}
```

Без `bpmn_meta` в payload — properties уже в XML.

### Session Persistence → Event Bus

```
session-saved(sessionId, diagramStateVersion)
```

### Property Sync Service подписывается

```
session-saved → re-extract extension state if needed
```

## Data flow (микросервисный)

```
User changes property
  ↓
Property Editor
  ↓
Extension State Service (async JSON CRUD)
  ↓
Property Sync Service (async XML fragment generation)
  ↓
BPMN Modeler (sync businessObject update)
  ↓
Session Persistence (async XML save)
  ↓
Event Bus: session-saved
  ↓
Extension State Service / Property Editor обновляют UI
```

## Event bus (предлагаемые события)

| Событие | Издатель | Подписчики |
|---|---|---|
| `property-changed` | Property Editor | Extension State Service |
| `extension-state-updated` | Extension State Service | Property Sync, Property Editor |
| `bpmn-xml-updated` | Session Persistence | Property Sync, Property Editor |
| `session-saved` | Session Persistence | Analytics, Cache invalidation |

## Где теряется state сейчас

1. **Property Editor → App.jsx:** преобразование draft в `camunda_extensions_by_element_id` и `bpmn_meta`.
2. **App.jsx → boundary:** выбор `baseDiagramStateVersion` из `draft` (может быть stale).
3. **Boundary → finalizeCamundaExtensionsXml:** генерация XML; здесь может произойти `nextXml === currentXml`.
4. **apiPutBpmnXml → backend:** 409/423/500.
5. **Backend → DB:** merge `bpmn_meta`.
6. **Background refresh → draft:** если refresh упал, draft остаётся с fallback patch, который может быть неполным.
