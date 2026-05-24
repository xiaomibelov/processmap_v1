# RUNTIME_PROOF_CHECKLIST_FILLED

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Вердикт: `CHANGES_REQUESTED`

## Runtime identity

- [x] `curl -I http://clearvestnic.ru:5180` returns HTTP 200.
- [x] no-cache headers checked.
- [x] `curl -sS http://clearvestnic.ru:8088/health` returns healthy response.
- [x] `/build-info.json` captured.
- [x] served contour/run/source worktree explained.

## Browser scenario

- [x] Fresh browser context.
- [x] Open ProcessMap runtime.
- [x] Open `Аналитика`.
- [x] Verify Analytics top-level exists.
- [x] Verify `Реестр действий`.
- [x] Verify `Реестр свойств`.
- [x] Verify `Дашборды`.
- [x] Open `Реестр свойств`.
- [x] Verify title/subtitle.
- [x] Verify scope selector.
- [x] Verify metrics row.
- [!] Verify filters/table if data mode is active: failed because `Тип объекта` contains element ids instead of object/BPMN types.
- [x] Verify honest foundation empty state in workspace mode.
- [x] Verify source truth note.
- [x] Verify no fake rows/counts in workspace foundation mode.
- [x] Verify `Вернуться` returns to Analytics.
- [x] Verify `Реестр действий` still works.
- [x] Verify global shell remains available.
- [x] Verify console clean in main reviewer scenario.
- [x] Verify no unsafe `PUT/PATCH/DELETE` from viewing/navigation.

## Scope safety

- [x] no backend/schema changes out of scope.
- [x] no BPMN XML mutation observed.
- [x] no Product Actions durable truth mutation observed.
- [x] no RAG runtime implementation in product diff.

## Blocking note

Session real-data mode is source-proven, but filter semantics are not. `Тип объекта` must not be populated from element ids.
