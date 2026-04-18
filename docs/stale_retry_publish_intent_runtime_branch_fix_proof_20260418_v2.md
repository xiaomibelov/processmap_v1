# Stale-Retry Publish Intent Runtime Branch Fix Proof (2026-04-18)

## Baseline (stage verdict, source of truth)
- Proven: `stage_stale_retry_publish_intent_verdict_20260418.md` shows live path where first request from `Создать новую ревизию` had `source_action=publish_manual_save`, got `409`, then replay request dropped `source_action`, and final persisted row became `manual_save`.
- Proven: This is a blocking correctness bug because explicit revision intent degrades to session-save intent in the accepted stale-retry outcome.

## Targeted Fix
- Proven: Coordinator now arms one-shot replay intent after `DIAGRAM_STATE_CONFLICT`/`409` on intent reasons (`manual_save*`, `publish_manual_save*`).
- Proven: Next non-intent flush (observed runtime replay trigger shape) is rewritten to `...:conflict_replay`, preserving intent through the live replay branch.
- Proven: `apiPutBpmnXml` reason normalization already maps `publish_manual_save:*` -> `source_action=publish_manual_save` and `manual_save:*` -> `source_action=manual_save`; test coverage extended for `:conflict_replay`.

## Targeted Tests
Command:
```bash
cd frontend
node --test src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs src/lib/api.bpmn.test.mjs
```

Result:
- Proven: 20/20 passed.
- Proven: Added case `stale conflict replay preserves publish intent marker in live 409 -> autosave replay branch` produced reasons:
  - first: `publish_manual_save`
  - replay: `publish_manual_save:conflict_replay`
- Proven: Added manual path guard case produced reasons:
  - first: `manual_save`
  - replay: `manual_save:conflict_replay`
- Proven: API mapping test confirms both `*:conflict_replay` reasons are persisted as canonical source actions.

## Before / After (exact branch)
- Before (proven from stage verdict): `publish_manual_save` -> `409` -> replay without marker -> persisted `manual_save`.
- After (proven locally via targeted tests): `publish_manual_save` -> `409` -> replay as `publish_manual_save:conflict_replay` -> payload canonicalizes to `source_action=publish_manual_save`.

## Conclusion
- Proven: The runtime branch matching observed stage pattern now preserves revision intent across stale replay.
- Unknown: Stage still requires rerun verdict to confirm end-to-end persisted rows are now `publish_manual_save` in live environment.
