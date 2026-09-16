# API — контракт sidecar provenance TO BE

> Контур: `fix/tobe-element-provenance-persistence-v1`. Два канала элементного
> provenance TO BE-сессий, созданных через `transform_asis`.

## Канал 1 — per-element `pm:Trace` в BPMN XML

Встраивается на фронте **до** `PUT /api/sessions/{id}/bpmn` (в `App.handleTobePublished`).

```xml
<bpmn:extensionElements>
  <pm:trace fate="transformed_to" rule_id="R01_move">
    <pm:derived_from>AsIs_1</pm:derived_from>
    <pm:derived_from>AsIs_2</pm:derived_from>
  </pm:trace>
</bpmn:extensionElements>
```

- `pm:Trace` — тип из `frontend/src/features/process/robotmeta/pmModdleDescriptor.js`
  (namespace `http://processmap.ai/schema/bpmn/1.0`, prefix `pm`; тот же namespace,
  что у `pm:RobotMeta`). Дескриптор зарегистрирован в `bpmnWiring.js` → элемент
  переживает save/reload моделлером (bpmn-js не считает его unknown).
- `pm:derived_from` — **массив** id AS IS-элементов (isMany → повторяющиеся
  дочерние элементы). Consolidated N→1: один TO BE-элемент, слитый из N AS IS,
  содержит N записей. Порядок — порядок следования в `trace_map`.
- `fate` — судьба из `transformation/pipeline.py` дословно:
  `transformed_to | pushed_below | dropped | open_question`. Плановые классы
  (`transformed|consolidated|new|removed`) — концептуальная группировка; в XML
  пишется исходное значение pipeline.
- `rule_id` — id правила трансформации или пусто (LLM-match с `rule_id=null`).
- Только у элементов, присутствующих в `trace_map[..].draft_node_ids`. Новые
  (не из transform) блоки не размечаются.
- Чужие `extensionElements` (camunda:properties, zeebe:…, pm:RobotMeta) не
  затрагиваются; повторное встраивание заменяет свой `pm:Trace` (идемпотентно).
- Чтение: `extractProvenanceFromBpmnXml(xml)` → `{ elementId: { derived_from[], fate, rule_id } }`.

## Канал 2 — sidecar-снапшот `trace_map` в meta сессии

### Запись (create)

`POST /api/projects/{project_id}/sessions` — тело (extra-поле, `extra="allow"`):

```json
{
  "title": "TO BE: Процесс v1",
  "process_layer": "to_be",
  "derived_from_session_id": "<as_is_session_id>",
  "bpmn_meta": {
    "provenance": {
      "source": "transform_asis",
      "trace_map": [ { "element_id": "...", "fate": "...", "rule_id": "...", "draft_node_ids": ["..."] } ]
    }
  }
}
```

- `bpmn_meta` — dict, мержится поверх `sessions.bpmn_meta_json` при create
  (shallow merge, как ключи верхнего уровня). Несериализуемый JSON → **422**
  (`bpmn_meta must be JSON-serializable`).
- Обрабатывается в обоих create-путях: `backend/app/projects.py`
  (`create_project_session`, atomic + fallback) и explorer
  `POST /api/projects/{id}/explorer/sessions` (`backend/app/routers/explorer.py`).
- Sidecar покрывает класс **removed**: удалённые AS IS-элементы имеют
  `draft_node_ids: []` и отсутствуют в XML по определению — живут только здесь.

### Чтение

`GET /api/sessions/{id}/meta` → поле `provenance` (additive):

```json
{ "session_id": "...", "provenance": { "source": "transform_asis", "trace_map": [...] }, ... }
```

`provenance = null`, если sidecar не записывался. Полный `bpmn_meta` (включая
`provenance`) также отдаётся в проекции `GET /api/sessions/{id}` (`bpmn_meta`).

## Чего контракт НЕ меняет

- op-протокол `POST /api/sessions/{id}/operations` — wire-формат без изменений
  (снапшот-сравнение: `git diff origin/main...HEAD` по `_legacy_main.py`,
  `routers/sessions.py`, `schemas/legacy_api.py` — пуст).
- OpenAPI: единственная дельта спеки — `bpmn_meta` в `CreateSessionBody`
  (explorer); `CreateSessionIn` (projects) — `extra="allow"`, схема без изменений.
  `docs/openapi.yaml` регенерирован (`scripts/dump_openapi.py`), redocly lint 0 errors.

## Best-effort ограничение

В `App.handleTobePublished` встраивание `pm:Trace` обёрнуто в try/catch: при сбое
embed публикация не ломается, XML уходит как есть (sidecar в meta всё равно
сохранён → класс removed и N→1-источники не теряются).
