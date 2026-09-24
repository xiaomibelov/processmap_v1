# PLAN — fix/tobe-element-provenance-persistence-v1

> **Происхождение плана**: утверждённый PLAN.md контура в окружении отсутствовал (EVIDENCE GAP,
> проверено по worktree, origin, audit-ветке `audit/db-plane-measures-20260916` и Obsidian-vault).
> Настоящий план реконструирован из брифа исполнителя от 2026-09-16 + артефактов аудитов
> `audit/save-layer-readiness-v1`, `audit/tobe-stage-model-v1`, `audit/tobe-diff-keys-v1`
> (PR #990, ветка audit/db-plane-measures-20260916). Содержательная рамка — из брифа,
> без отклонений.

## Проблема (из аудитов)

Связь AS IS→TO BE переживает save только на уровне сессии (`sessions.derived_from_session_id`,
пишется только при create: `backend/app/routers/explorer.py`, `projects.py`). Элементная
трассировка (`trace_map` из transform-пайплайна) живёт во фронтовом стейте
(`frontend/src/features/technologist/workspace/Workspace.jsx`) и после save/reload теряется
полностью → охват provenance-first 0% на элементном уровне. Content-сопоставление
AS IS↔TO BE неработоспособно (0/14 exact match; имена — единственный устойчивый якорь).

## Цель

Персистить элементный provenance TO BE-сессий, созданных через transform_asis, в двух каналах.

## Каналы записи (минимальный патч)

1. **Per-element extensionElements в BPMN XML**: `pm:derived_from` — массив id элементов AS IS
   (consolidated N→1, элемент TO BE может сливаться из нескольких), опционально
   `pm:trace_fate` (transformed|consolidated|new|removed), `pm:trace_rule_id`.
   Namespace `pm:*` регистрируется в bpmn-js wiring (`frontend/.../bpmnWiring.js`).
2. **Sidecar-снапшот полного trace_map** (покрывает класс removed — удалённые элементы исчезают
   из XML): сериализуется в meta сессии при create из draft (поле в `bpmn_meta_json` или
   выделенная колонка — решение исполнителя по существующим паттернам meta, миграции БД
   нежелательны; предпочтение — `bpmn_meta_json`, т.к. он уже JSON-text и версионируется
   без DDL).

## Парсер

Чтение `pm:*` ключей: свериться с контуром `fix/bpmn-properties-parser-audit-v1`
(артефакты: `p0-work/.planning/contours/fix/bpmn-properties-parser-audit-v1/`,
парсер extensionElements/zeebe:properties уже существует — переиспользовать, не дублировать).

## Жёсткие запреты

- НЕ трогать: `saveCoordinator.js`, op-протокол `/operations` (схема не меняется,
  снапшот-сравнение в no-regression), canvas/рендер, overlay UI, diff-логику.
- Без бэкфилла существующих пар (trace утрачен — known limitation).
- Без merge/deploy/push без явного approve пользователя.

## Точки встраивания (предварительно, подтвердить по коду)

- Frontend create-цепочка draft→TO BE: `frontend/src/features/technologist/workspace/Workspace.jsx`
  (trace_map в стейте), transform-пайплайн (`transformation/pipeline.py` — аналог/спека правил),
  create-вызов через `frontend/src/lib/api.js` → backend create-сессии
  (`backend/app/routers/explorer.py`, `projects.py` — derived_from_session_id).
- Backend: при create принимать и складывать sidecar в meta; отдавать в GET meta.

## Критерии приёмки

1. unit: запись/чтение `pm:derived_from` (включая массив для consolidated N→1).
2. round-trip: create TO BE → правка в моделлере → save → reload → export XML → provenance цел
   у 100% элементов с derived_from.
3. api: create из draft персистит sidecar; meta читается обратно.
4. no-regression: save-регрессия (71 passed) + persistence (15 passed) зелёные; схема
   op-протокола не изменена (снапшот-сравнение).

## Known limitations

- Существующие пары AS IS↔TO BE не бэкфиллятся (элементный trace утрачен ранее).
- Класс removed покрывается только sidecar (в XML удалённых элементов нет по определению).
