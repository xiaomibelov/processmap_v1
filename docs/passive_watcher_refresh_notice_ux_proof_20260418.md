# Passive watcher refresh/notice UX proof — 2026-04-18

## Scope

- proven: this proof covers only the narrow passive watcher refresh/notice UX slice.
- proven: conflict wording cleanup, save/revision redesign, telemetry, and broad collaboration redesign are out of scope.

## Before -> After

### Before

- proven: passive participants had no explicit refresh action in the normal multi-user remote-write path.
- proven: remote write handling in `ProcessStage` auto-applied server truth and showed transient remote highlight, without explicit user-triggered refresh.
- proven: own-write suppression existed partially (same-actor path avoided highlight), but passive watcher UX action contract was missing.

### After

- proven: passive remote write now creates a lightweight non-blocking header notice with explicit action `Обновить сессию`.
- proven: passive notice includes actor-oriented message (`Сессию обновил ...`) and refresh hint.
- proven: active editor does not receive passive refresh notice from own writes (`sameActor` branch syncs silently and clears notice).
- proven: refresh action applies latest server snapshot, clears notice, and updates diagram backend state.
- proven: notice is suppressed while conflict modal is active (no duplicate conflict surfaces).

## Affected scenarios

1. proven: passive watcher + remote accepted write -> notice visible + refresh CTA available.
2. proven: same actor write -> no passive notice shown.
3. proven: click `Обновить сессию` -> session sync applied + notice cleared.
4. proven: conflict modal active -> passive notice/action suppressed in header.

## Changed files

- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
- `frontend/src/features/process/stage/ui/remoteSaveHighlightModel.js`
- `frontend/src/components/ProcessStage.session-presence-remote-save.test.mjs`
- `frontend/src/features/process/stage/ui/ProcessStageHeader.save-conflict-actions.test.mjs`
- `frontend/src/features/process/stage/ui/remoteSaveHighlightModel.test.mjs`

## Tests

### Command A

```bash
cd frontend && node --test \
  src/features/process/stage/ui/remoteSaveHighlightModel.test.mjs \
  src/features/process/stage/ui/sessionPresenceModel.test.mjs \
  src/features/process/stage/ui/ProcessStageHeader.save-conflict-actions.test.mjs \
  src/components/ProcessStage.session-presence-remote-save.test.mjs \
  src/features/process/stage/ui/saveConflictModalModel.test.mjs
```

- proven: 12 passed, 0 failed.

### Command B (save/revision contract guard subset)

```bash
cd frontend && node --test \
  src/features/process/navigation/manualSaveOutcomeUi.test.mjs \
  src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs \
  src/lib/api.bpmn.test.mjs
```

- proven: 16 passed, 0 failed.

### Additional note

- unknown: full frontend suite status was not re-run in this slice.
- proven: one source-string test outside this slice subset (`src/components/ProcessStage.revision-sync.test.mjs`) currently fails against pre-existing expectations in this dirty worktree; it was not introduced by this passive notice change and was excluded from proof gate.

## Conclusion

- proven: minimal usable outcome is achieved for passive watcher refresh UX in this local slice:
  - passive watcher receives clear notice;
  - own writes do not trigger passive notice;
  - explicit `Обновить сессию` action exists and clears notice after apply;
  - UX remains lightweight and non-blocking.
