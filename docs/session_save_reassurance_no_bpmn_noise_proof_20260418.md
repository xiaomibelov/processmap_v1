# Session-save reassurance + BPMN-noise cleanup proof (2026-04-18)

## Before
- Save action visibility depended on dirty-state/render branches.
- Technical upload copy leaked to user surface:
  - `BPMN: подготовка сохранения`
  - `BPMN: загрузка ...`
  - `BPMN: сохранено (...)`
  - `BPMN: без изменений ...`
- Save button was not a stable reassurance control in all session contexts.

## After
- `Сохранить сессию` is rendered as a constant reassurance action while session is open.
- Save action no longer depends on the old conditional `showSaveActionButton ? (...)` render branch.
- Manual save handler no longer blocks by `isBpmnTab` guard.
- User-facing upload badge no longer shows technical BPMN progress/size noise.
- Technical labels were replaced with neutral session wording, and non-error technical stages are hidden from header surface.
- `Создать новую ревизию` remains separate with unchanged intent boundary.

## Targeted tests
Command:

```bash
cd frontend && node --test \
  src/features/process/stage/controllers/useProcessStageShellController.test.mjs \
  src/features/process/stage/ui/ProcessStageHeader.revision-action-contract.test.mjs \
  src/features/process/stage/ui/ProcessStageHeader.save-conflict-actions.test.mjs \
  src/features/process/navigation/saveUploadStatus.test.mjs \
  src/components/ProcessStage.revision-sync.test.mjs \
  src/features/process/navigation/manualSaveOutcomeUi.test.mjs
```

Result:
- `28 passed, 0 failed`.

## Conclusion
- Session save now behaves as a stable reassurance action.
- Revision creation remains explicit and separate.
- Technical BPMN pipeline noise is removed from primary user-facing status surface.
