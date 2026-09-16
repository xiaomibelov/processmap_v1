# PR — fix(provenance): элементный provenance TO BE-сессий (pm:Trace + sidecar trace_map)

## Проблема

Связь AS IS→TO BE переживала save только на уровне сессии
(`sessions.derived_from_session_id`). Элементная трассировка (`trace_map` из
`transform_asis`) жила во фронтовом стейте и после save/reload терялась
полностью — охват provenance-first 0% на элементном уровне (аудиты
`save-layer-readiness-v1`, `tobe-stage-model-v1`, `tobe-diff-keys-v1`).

## Решение

Два канала записи при create TO BE-сессии из опубликованного draft-шаблона:

1. **Per-element `pm:Trace` в BPMN XML** (`<pm:derived_from>*` — массив id AS IS,
   consolidated N→1; опционально `fate`, `rule_id`) — встраивается на фронте
   до `PUT /bpmn`. Namespace `pm` уже зарегистрирован в bpmn-js wiring →
   элемент переживает save/reload моделлером.
2. **Sidecar-снапшот полного `trace_map`** в `bpmn_meta.provenance`
   (`bpmn_meta_json`, без DDL) — покрывает класс removed (удалённых элементов
   нет в XML по определению). Backend принимает `bpmn_meta` при create
   (projects + explorer пути), `GET /api/sessions/{id}/meta` отдаёт `provenance`.

## Изменения

- `frontend/.../technologist/workspace/tobeProvenance.js` (new) — построение
  карты provenance, embed/extract через bpmn-moddle; unit + round-trip тесты.
- `frontend/.../robotmeta/pmModdleDescriptor.js` — тип `pm:Trace`.
- `frontend/.../technologist/workspace/Workspace.jsx` — traceMap в onPublishedTobe.
- `frontend/src/App.jsx` — sidecar в create-сессии + embed перед PUT bpmn.
- `backend/app/projects.py`, `backend/app/routers/explorer.py` — приём и merge
  `bpmn_meta` при create (422 на несериализуемый JSON).
- `backend/app/services/session_service.py` — `provenance` в ответе meta.
- `backend/tests/test_tobe_provenance_sidecar.py` — API-тесты канала 2.
- `docs/openapi.yaml` — регенерация (`CreateSessionBody.bpmn_meta`), lint 0 errors.

## Чего НЕ делает

- Не трогает op-протокол `/operations`, saveCoordinator, canvas/рендер,
  overlay UI, diff-логику (снапшот-сравнение пусто).
- Не бэкфиллит существующие пары (trace утрачен ранее — known limitation).

## Проверка

- фронт unit+round-trip: 9/9 (`node --test tobeProvenance.test.mjs`);
- backend api: 6/6 (`pytest test_tobe_provenance_sidecar.py`);
- no-regression save/persist сьюты: без новых падений относительно origin/main
  (детали и env-ограничения — в TESTS.md контура).

BREAKING: нет (аддитивные поля; CreateSessionIn — extra="allow").
