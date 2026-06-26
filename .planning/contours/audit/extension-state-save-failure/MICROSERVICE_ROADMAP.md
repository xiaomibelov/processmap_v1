# MICROSERVICE_ROADMAP.md — план выделения сервисов

## Phase 0: P1 immediate fix (внутри монолита)

**Цель:** устранить острый баг без архитектурных изменений.

1. Добавить логирование в `persistCamundaExtensionsViaCanonicalXmlBoundary` и `session_bpmn_save`.
2. Проверить, что `baseDiagramStateVersion` берётся из самого актуального источника (`draft` или последний ответ сервера).
3. Обработать случай `nextXml === currentXml` более мягко — возможно, делать meta-only PATCH вместо ошибки.
4. Убедиться, что retry на 409 использует свежий `bpmn_xml` и `bpmn_meta`.

## Phase 1: dedicated property endpoint

**Цель:** разделить property save и diagram XML save.

1. Backend: добавить `PUT /api/sessions/{sid}/elements/{elementId}/extension-state`.
   - Принимает только `camunda_extensions_by_element_id` slice.
   - Сохраняет в `bpmn_meta_json`.
   - Берёт `base_diagram_state_version` и инкрементирует.
   - Без Redis lock (только CAS) — не перезаписывает XML.
2. Frontend: `camundaExtensionsSaveBoundary` сначала пытается новый endpoint; при конфликте/ошибке fallback к XML PUT.
3. Property Sync Service (внутри backend) подписывается на изменение `bpmn_meta` и обновляет XML перед отдачей в modeler.

## Phase 2: async property sync

**Цель:** property save не блокирует пользователя.

1. Ввести очередь/события:
   - `extension-state-updated` → Property Sync генерирует XML fragment.
   - `bpmn-xml-needs-save` → Session Persistence сохраняет XML.
2. Property Editor показывает optimistic update и resolve/reject по событию.
3. Версионирование: `diagram_state_version` инкрементируется только при фактическом XML save.

## Phase 3: выделение Extension State Service

**Цель:** отдельный deployable сервис.

1. Сервис `extension-state-service`:
   - Хранит `camunda_extensions_by_element_id` в собственной таблице / JSONB.
   - API: CRUD по `(session_id, element_id)`.
   - Публикует `extension-state-changed`.
2. Сервис `property-sync-service`:
   - Подписан на `extension-state-changed`.
   - Генерирует/апдейтит XML fragment.
   - Публикует `bpmn-xml-needs-save`.
3. Сервис `session-persistence-service`:
   - Только load/save XML + CAS.
   - Публикует `session-saved`.

## Phase 4: BPMN Modeler Service

**Цель:** изолировать canvas/modeler.

1. Вынести `bpmn-js` и связанные модули в отдельный сервис.
2. API: `applyXml`, `getXml`, `getElementProperties`, `updateElementProperties`.
3. Property Editor работает через этот сервис, а не напрямую с DOM/modeler.

## Приоритеты

| Приоритет | Работа | Риск | Ожидаемый эффект |
|---|---|---|---|
| P0 | Логирование + диагностика | низкий | Понимание root cause |
| P1 | Fix base version / retry / meta-only fallback | низкий | Устранение текущего бага |
| P2 | Dedicated property endpoint | средний | Уменьшение конфликтов, меньше payload |
| P3 | Async sync + event bus | средний | UX без блокировок |
| P4 | Выделение Extension State Service | высокий | Масштабируемость, независимые релизы |
| P5 | BPMN Modeler Service | высокий | Полная изоляция canvas |

## API contracts (target)

### Extension State Service

```http
PUT /sessions/{sid}/elements/{eid}/extension-state
Body: { properties, listeners, base_diagram_state_version }
Response: { ok, diagram_state_version, camunda_extensions_by_element_id }

GET /sessions/{sid}/elements/{eid}/extension-state
Response: { properties, listeners }

DELETE /sessions/{sid}/elements/{eid}/extension-state
Response: { ok, diagram_state_version }
```

### Property Sync Service

```
Input event: extension-state-changed(sessionId, elementId, state)
Output event: bpmn-xml-needs-save(sessionId, xmlFragment, elementId)
```

### Session Persistence Service

```http
PUT /sessions/{sid}/bpmn
Body: { xml, base_diagram_state_version }
Response: { ok, version, diagram_state_version }
```
