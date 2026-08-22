# RECOMMENDATIONS.md — fix-контуры

## P0 — Диагностика (до любого кода-фикса)

1. Включить временное логирование в production/stage:
   - `persistCamundaExtensionsViaCanonicalXmlBoundary`: `currentXml.length`, `nextXml !== currentXml`, `baseDiagramStateVersion`, `saveRes.status`, `saveRes.error`.
   - `session_bpmn_save`: `client_base_version`, `server_current_version`, `changed_keys`, `lock.acquired`.
2. Добавить Sentry/Error Boundary событие при property save failure с request/response payload.
3. Собрать 10-20 случаев ошибки с stage/test-stand.

## P1 — Immediate fix (внутри существующей архитектуры)

### 1.1 Использовать актуальную base version

В `App.jsx:setElementCamundaExtensions` брать `baseDiagramStateVersion` из надёжного источника — последнего ответа сервера, а не только из `draft`:

```js
const baseDiagramStateVersion = Number(
  latestServerDiagramStateVersionRef.current
  ?? draft?.diagram_state_version
  ?? draft?.bpmn_xml_version
  ?? draft?.version
  ?? 0,
);
```

### 1.2 Мягкая обработка "XML не изменился"

Если `nextXml === currentXml`, но `camunda_extensions_by_element_id` изменился, делать **meta-only PATCH** (`PATCH /api/sessions/{sid}`) вместо ошибки:

```js
if (nextXml === currentXml) {
  return apiPatchSession(sid, {
    bpmn_meta: nextMeta,
    base_diagram_state_version: baseDiagramStateVersion,
  });
}
```

### 1.3 Улучшить retry

- Retry должен обновлять не только `baseDiagramStateVersion`, но и `currentXml`/`nextMeta` из `latest.session` (уже делается, проверить на баги).
- Добавить exponential backoff на 423 lock.

### 1.4 Отключить parallel property save

В `saveSelectedCamundaProperties` уже есть `camundaPropertiesBusy` guard, но проверить, что autosave диаграммы не мутирует `draft.bpmn_xml` между началом property save и PUT.

## P2 — State sync fix

1. **Единый truth source для версий.** Ввести `diagramStateVersionRef` в `App.jsx`, обновляемый только из ответов сервера и background refresh.
2. **Optimistic update + rollback.** При property save обновлять `draft.bpmn_meta` оптимистично, но rollback при ошибке.
3. **Background refresh resilience.** Если background refresh после property save падает, не показывать "Сохранено на сервере" бесконечно; ограничить время и перейти в состояние "требуется обновление".
4. **Fix property serialization tests.** Заставить `camundaExtensions.test.mjs` работать в CI (Node 20 / jsdom ESM fix) или перенести критичные тесты на `happy-dom`/`vitest`.

## P3 — Микросервисное выделение

1. **Dedicated property endpoint** (`PUT /api/sessions/{sid}/elements/{eid}/extension-state`) — не перезаписывать XML при каждом property change.
2. **Property Sync Service** — асинхронно генерировать XML fragment и применять к modeler.
3. **Event bus** — `extension-state-changed`, `bpmn-xml-needs-save`, `session-saved`.
4. **Отдельное хранение extension state** — таблица `session_element_extension_state(session_id, element_id, state_json, version)`.

## Риски

| Fix | Риск | Митигация |
|---|---|---|
| P1 meta-only fallback | Backend PATCH не обновляет `bpmn_xml`; при следующей загрузке `finalizeCamundaExtensionsXml` всё равно инжектирует properties. | Протестировать загрузку/сохранение цикл. |
| P1 актуальная версия | Возможны race condition, если несколько вкладок. | Server-side CAS остаётся authoritative. |
| P2 optimistic update | Rollback может конфликтовать с параллельными изменениями. | Использовать seq-номера writes. |
| P3 выделение сервиса | Большой объём работы, требуется миграция данных. | Этапная миграция: сначала endpoint, потом таблица. |

## Рекомендуемый порядок

1. **P0** — собрать логи и подтвердить H1/H2/H3.
2. **P1.1 + P1.2** — быстрый fix в рамках монолита.
3. **P2** — стабилизировать state sync и тесты.
4. **P3** — планировать по приоритету scale/team size.
