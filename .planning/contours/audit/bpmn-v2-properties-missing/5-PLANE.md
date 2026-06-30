# 5-PLANE — audit/bpmn-v2-properties-missing

| Plane | Status | Evidence |
|---|---|---|
| **Code** | ✅ Confirmed | `ElementSettingsControls.jsx` и `useElementSettingsController.js` рисуют «Дополнительные BPMN-свойства» только из `extensionStateDraft`. `NotesPanel.jsx` инициализирует `camundaPropertiesDraft` из `draft.bpmn_meta.camunda_extensions_by_element_id`. `App.jsx:412-418` отключает XML-гидратацию, если ключ `camunda_extensions_by_element_id` присутствует. `executeBpmnContextMenuAction.js` мутирует `extensionElements` modeler'а без записи в `bpmn_meta`. |
| **Build** | ✅ No build failures expected | Продуктовый код не менялся. Аудит не вносит изменений, требующих сборки. |
| **Endpoint** | ✅ Alive (stage) | Stage `clearvestnic.ru:5177` доступен; property-save endpoint (`PATCH /api/sessions/{id}/properties`) и `PUT /api/sessions/{id}/bpmn` работают в предыдущих контурах. Для данного аудита не требовался runtime-вызов. |
| **Tests** | ⚠️ No reproduction test yet | Существующие тесты `camundaExtensions.test.mjs` подтверждают извлечение свойств из XML, но нет теста, проверяющего, что сайдбар видит XML-only/V2 свойства. Рекомендуется добавить в `SOLUTION.md`/TESTS.md. |
| **Serving mode** | ✅ No deploy changes | Только чтение кода и написание артефактов. Deploy не производился. |

## Additional notes

- **Runtime proof:** полное runtime-подтверждение требует аутентификации на stage и ручного сравнения V2 overlay с сайдбаром. В рамках аудита достаточно code-based evidence, т.к. расхождение источников данных читается напрямую из исходников.
- **Product code changes:** none.
