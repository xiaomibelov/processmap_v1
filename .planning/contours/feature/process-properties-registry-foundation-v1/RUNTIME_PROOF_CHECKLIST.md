# RUNTIME_PROOF_CHECKLIST

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Runtime identity

- [ ] `curl -I http://clearvestnic.ru:5180` returns HTTP 200.
- [ ] no-cache headers checked.
- [ ] `curl -sS http://clearvestnic.ru:8088/health` returns healthy response.
- [ ] `/build-info.json` captured.
- [ ] served contour/run/source worktree explained.

## Browser scenario

- [ ] Fresh browser context.
- [ ] Open ProcessMap runtime.
- [ ] Open `Аналитика`.
- [ ] Verify Analytics top-level exists.
- [ ] Verify `Реестр действий`.
- [ ] Verify `Реестр свойств`.
- [ ] Verify `Дашборды`.
- [ ] Open `Реестр свойств`.
- [ ] Verify title/subtitle.
- [ ] Verify scope selector.
- [ ] Verify metrics row.
- [ ] Verify filters/table or foundation empty state.
- [ ] Verify source truth note.
- [ ] Verify no fake rows/counts.
- [ ] Verify `Вернуться` returns to Analytics.
- [ ] Verify `Реестр действий` still works.
- [ ] Verify global shell unchanged.
- [ ] Verify console clean.
- [ ] Verify no unsafe `PUT/PATCH/DELETE` from viewing/navigation.

## Scope safety

- [ ] no backend/schema changes out of scope.
- [ ] no BPMN XML mutation.
- [ ] no Product Actions durable truth mutation.
- [ ] no RAG runtime implementation.
