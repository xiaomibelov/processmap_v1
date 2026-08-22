# FRONTEND_SAVE_FLOW.md — BPMN extension-state / properties save

## User flow
1. Пользователь выделяет BPMN-элемент.
2. В правой панели отрисовывается `ElementSettingsControls` → секция `CamundaPropertiesSettings`.
3. Пользователь редактирует поля. Локальный draft живёт в `useElementSettingsController`.
4. Триггер сохранения:
   - кнопка **"Сохранить"** в секции,
   - **Enter** в input (кроме textarea/select/button),
   - автосейв при переключении чекбокса "Показывать свойства над задачей".

## Компоненты и файлы

| Компонент / хук | Файл | Роль |
|---|---|---|
| `CamundaPropertiesSection` | `frontend/src/components/sidebar/CamundaPropertiesSection.jsx` | Обертка property panel. |
| `CamundaPropertiesSettings` | `frontend/src/components/sidebar/ElementSettingsControls.jsx` | UI формы: operation, properties, I/O, headers, listeners, documentation. |
| `useElementSettingsController` | `frontend/src/components/sidebar/useElementSettingsController.js` | Управление локальным draft extension-state. |
| `NotesPanel` | `frontend/src/components/NotesPanel.jsx` | Содержит `saveSelectedCamundaProperties`, статусы (`camundaPropertiesBusy`, `camundaExtensionSaveFailed`, `camundaPropertiesErr`). |
| `setElementCamundaExtensions` | `frontend/src/App.jsx:2539` | Корневой обработчик: строит optimistic meta и вызывает boundary. |
| `persistCamundaExtensionsViaCanonicalXmlBoundary` | `frontend/src/features/process/camunda/camundaExtensionsSaveBoundary.js` | Формирует канонический XML с properties и PUT-ит на сервер. |
| `finalizeCamundaExtensionsXml` | `frontend/src/features/process/camunda/camundaExtensions.js:1670` | Инжектирует DB-properties в BPMN XML. |
| `apiPutBpmnXml` | `frontend/src/lib/api.js:1539` | Клиент для `PUT /api/sessions/{sid}/bpmn`. |

## Триггеры сохранения

```jsx
// ElementSettingsControls.jsx:1857-1863
function handlePropertiesKeyDown(event) {
  if (event.key !== "Enter") return;
  const tag = (event.target?.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "button" || tag === "select") return;
  event.preventDefault();
  void onSaveExtensionState?.();
}
```

```jsx
// NotesPanel.jsx:2407-2426
const setShowPropertiesFlag = useCallback((enabled) => {
  ...
  updateCamundaPropertiesDraft(nextDraft);
  void saveSelectedCamundaProperties(nextDraft);
}, [...]);
```

## API endpoint и payload

**Endpoint:** `PUT /api/sessions/{session_id}/bpmn`

**Caller:** `apiPutBpmnXml` (`frontend/src/lib/api.js:1539`)

**Payload:**
```json
{
  "xml": "<bpmn:definitions>... с инжектированными camunda:properties ...</bpmn:definitions>",
  "base_diagram_state_version": 123,
  "source_action": "manual_save",
  "bpmn_meta": {
    "version": 1,
    "flow_meta": {...},
    "node_path_meta": {...},
    "robot_meta_by_element_id": {...},
    "camunda_extensions_by_element_id": {
      "Activity_1": {
        "properties": {
          "extensionProperties": [{"id": "p1", "name": "ingredient", "value": "salt"}],
          "extensionListeners": []
        },
        "preservedExtensionElements": []
      }
    },
    "presentation_by_element_id": {...},
    "hybrid_layer_by_element_id": {...},
    "hybrid_v2": {...},
    "drawio": {...}
  }
}
```

## Error handling

### В `persistCamundaExtensionsViaCanonicalXmlBoundary`
- Если `nextXml` пустой → локальная ошибка `"Пустая BPMN XML: не удалось применить Properties."`.
- Если `nextXml === currentXml` → локальная ошибка `"Изменения Properties не применились к BPMN XML."`.
- Если `apiPutBpmnXml` недоступен → `"apiPutBpmnXml unavailable"`.
- Если PUT вернул **409** → **один retry** с `apiGetSession` и перестроением XML на свежем `bpmn_xml`.
- Если retry не удался → `ok: false, status: 409/..., error: ...`.

### В `saveSelectedCamundaProperties` (NotesPanel)
```jsx
if (result && result.ok === false) {
  setCamundaExtensionSavePhase("idle");
  setCamundaExtensionSaveFailed(true);
  setCamundaPropertiesErr(str(result.error || "Не удалось сохранить Properties."));
  return;
}
```

Форма **не сбрасывается** автоматически. Пользователь видит:
- `extensionStateSyncState === "error"`,
- helper `"Не удалось сохранить extension-state. Изменения остались в форме."`,
- CTA "Повторить".

### Optimistic update
- **Нет** оптимистичного обновления формы перед ответом.
- `backgroundSessionRefresh: true` — после успешного PUT сразала синхронизирует `fallbackPatch`, затем фоном запрашивает свежую сессию.

## Отличие от обычного BPMN XML save

| Аспект | Properties save | Обычный BPMN XML save |
|---|---|---|
| Триггер | кнопка / Enter / checkbox | commandStack change / autosave / Ctrl+S |
| XML source | `finalizeCamundaExtensionsXml(current draft XML + new properties)` | `bpmn-js` export current diagram |
| Meta source | полный `bpmn_meta` с `camunda_extensions_by_element_id` | обычно только `base_diagram_state_version` |
| Retry на 409 | один retry с `apiGetSession` | координатор autosave имеет свою очередь |
| Lock | Redis lock на session | Redis lock на session |
| Reason | `manual_save:camunda_extensions` | `autosave`, `manual_save` и др. |

## Ключевые риски во frontend flow
1. `baseDiagramStateVersion` берётся из `draft`, который может отставать от сервера.
2. Retry зависит от `apiGetSession`; если он падает, пользователь остаётся с ошибкой.
3. Если `finalizeCamundaExtensionsXml` не меняет XML (например, при некорректном `elementId` или пустой нормализации), сохранение блокируется до исправления.
