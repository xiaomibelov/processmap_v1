# WORKER_REPORT — fix/tobe-element-provenance-persistence-v1

> Agent 2 (Executor), контур fix. Дата: 2026-09-16.

## Runtime/source truth

```
pwd: /Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-tobe-element-provenance-persistence-v1
git remote -v: origin git@github.com:xiaomibelov/processmap_v1.git (+ graphify, не используется)
git branch --show-current: fix/tobe-element-provenance-persistence-v1
git rev-parse HEAD: dc19f039 (на момент отчёта; base 999f0e37 = origin/main)
git rev-parse origin/main: 999f0e37c8138a736373550b9c978108424ac74c
git status -sb: clean, ветка ahead origin/main на N коммитов контура
```

`intended == served`: worktree на ветке контура, HEAD = origin/main + коммиты
контура, чужих изменений нет.

## Цепочка draft→create (воспроизведена по коду)

1. **transform** — `frontend/src/features/technologist/workspace/Workspace.jsx:540-568`
   `handleTransform()`: `POST /api/process-templates/transform-asis` →
   `setTraceMap(asArray(r.data.trace_map))` (строка 560). trace_map в стейте:
   `Workspace.jsx:102`. Производитель trace_map — `backend/app/transformation/pipeline.py:421-707`
   (`element_id` = AS IS, `draft_node_ids` = TO BE-узлы, `fate`, `rule_id`).
2. **publish draft** — `Workspace.jsx:403-445` `handlePublishTemplate()`:
   `PUT /api/process-templates/{id}` → `POST .../publish` → при успехе
   `onPublishedTobe({ templateId, version, templateName, traceMap })` (строки 431-438).
3. **create TO BE-сессии** — `frontend/src/App.jsx:3809-3848` `handleTobePublished`
   (проп Problem; `App.jsx:4363 onPublishedTobe={handleTobePublished}`):
   - `GET /api/process-templates/{id}/versions/{v}/bpmn` → XML (id элементов ==
     id узлов ui_model, т.к. `backend/app/process_template/bpmn_export.py:312`
     использует `node.id` как BPMN id);
   - `apiCreateProjectSession(...)` (`frontend/src/lib/api.js:153-178`, extra-поля
     пробрасываются в тело) — **sidecar**: `bpmn_meta: { provenance: { source,
     trace_map } }`;
   - **канал 1**: `embedProvenanceIntoBpmnXml(xml, traceMap)` до `apiPutBpmnXml`;
   - `apiPutBpmnXml(newSid, xml, { source_action: "tobe_publish" })`.
4. **backend create** — `backend/app/routers/sessions.py:64-66` →
   `backend/app/projects.py create_project_session`: W4-поля атомарно в INSERT
   (строки ~407-417), `_initial_bpmn_meta_patch(inp)` мержит `bpmn_meta` в
   `sessions.bpmn_meta_json` (shallow, 422 на несериализуемый JSON); тот же
   приём в explorer-пути `backend/app/routers/explorer.py`
   (`POST /api/projects/{id}/explorer/sessions`, `CreateSessionBody.bpmn_meta`).
5. **read** — `GET /api/sessions/{id}/meta` (`backend/app/services/session_service.py`
   `get_session_meta`) отдаёт `provenance`; полный `bpmn_meta` — в проекции
   `GET /api/sessions/{id}`.

## Реализация (минимальный патч)

| Файл | Изменение |
|------|-----------|
| `frontend/src/features/technologist/workspace/tobeProvenance.js` | NEW: buildProvenanceByTobeId (инверсия trace_map, N→1), buildProvenanceSidecar, embed/extract через bpmn-moddle |
| `frontend/src/features/process/robotmeta/pmModdleDescriptor.js` | тип `pm:Trace` (derived_from isMany, fate/rule_id attrs) в существующем pm namespace |
| `frontend/src/features/technologist/workspace/Workspace.jsx` | traceMap в payload onPublishedTobe |
| `frontend/src/App.jsx` | handleTobePublished: sidecar в create + embed перед PUT bpmn (best-effort try/catch) |
| `backend/app/projects.py` | `_initial_bpmn_meta_patch` + merge в atomic и fallback create-путях |
| `backend/app/routers/explorer.py` | `CreateSessionBody.bpmn_meta` + merge в explorer create |
| `backend/app/services/session_service.py` | `provenance` в ответе get_session_meta |
| `docs/openapi.yaml` | регенерация (только `bpmn_meta` в CreateSessionBody), redocly lint OK |

Паттерны парсера/дескрипторов переиспользованы из контуров
`fix/bpmn-properties-parser-audit-v1` (extract-философия) и robotmeta
(pm namespace, moddle descriptor). Дублирующий парсер не создавался.

## Round-trip доказательство (канал 1)

Embed (consolidated N→1, Task_a ← AsIs_1 + AsIs_2):

```xml
<bpmn:extensionElements>
  <pm:Trace fate="transformed_to" rule_id="R01_move">
    <pm:derived_from>AsIs_1</pm:derived_from>
    <pm:derived_from>AsIs_2</pm:derived_from>
  </pm:Trace>
</bpmn:extensionElements>
```

После «правки в моделлере» (bpmn-moddle: parse → rename → toXML — тот же
движок сериализации, что bpmn-js saveXML) фрагмент XML **идентичен** (имя
задачи изменено, pm:Trace цел). Reload-extract:

```json
{ "Task_a": { "derived_from": ["AsIs_1", "AsIs_2"], "fate": "transformed_to", "rule_id": "R01_move" },
  "Flow_a_b": { "derived_from": ["AsIs_4"], "fate": "transformed_to", "rule_id": "" } }
ROUND_TRIP_100_PERCENT = true
```

Прогон: `frontend/src/features/technologist/workspace/tobeProvenance.test.mjs`
(9 тестов, включая round-trip).

## Решения и отклонения

- **Sidecar в `bpmn_meta_json`** (не DDL-колонка) — по предпочтению плана:
  JSON-text, версионируется штатно, проекция/meta уже его отдают.
- Имя extra-поля create — **`bpmn_meta`** (не `provenance_trace_map`): консистентно
  с PATCH `bpmn_meta`, generic merge, provenance — ключ верхнего уровня внутри.
- `pm:Trace` с заглавной (как `pm:RobotMeta`) — конвенция moddle-дескриптора pm.
- fate пишется дословно из pipeline (`transformed_to|pushed_below|dropped|
  open_question`), плановые классы — концептуальные.
- Embed best-effort в try/catch: публикация не ломается, sidecar всё равно спасает
  removed/N→1.
- OpenAPI-регенерация потребовалась из-за объявленного поля `bpmn_meta` в
  `CreateSessionBody` (explorer); `CreateSessionIn` (projects) — extra="allow",
  дельты спеки нет.
- Числа регрессии (71/15 из брифа) получены в эталонном окружении; в изолированном
  раннере (без Postgres/Redis на хосте) часть тестов skipped/env-failed — см.
  TESTS.md со сравнением current vs origin/main.

## Known limitations

- Бэкфилл существующих пар не выполнялся (элементный trace утрачен ранее).
- Класс removed — только sidecar (в XML удалённых элементов нет по определению).
- Полноценный e2e через браузерный bpmn-js не выполнялся: round-trip доказан на
  bpmn-moddle (слой сериализации bpmn-js) + jsdom-совместимых unit-тестах;
  фиксация ограничения — в TESTS.md.
