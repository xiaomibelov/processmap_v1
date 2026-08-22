# fix/hybrid-auto-subprocess — Executor Report

## Goal
Implement hybrid subprocess creation: on BPMN save auto-create up to 10 child sessions; if more exist, show a "Загрузить остальные N" button in the explorer to load the rest.

## Commits
- `3bfe5aca` feat(subprocess): auto-create up to 10 on save, flag remaining
- `19e1b5e8` feat(subprocess): expose subprocesses_count in explorer SessionItem
- `af397c12` feat(subprocess): show load-remaining button when auto-created < total
- `b9540c2a` test(subprocess): hybrid auto-create on save and load-remaining
- `ec373c43` fix(deploy): pass BUILD_* and VITE_BUILD_* metadata in explicit stage ref deploy

## Files changed
- `backend/app/services/session_service.py` — `bpmn_save` auto-creates ≤10 children, stores metadata
- `backend/app/routers/explorer.py` — `SessionItem` includes `subprocesses_count`
- `frontend/src/features/explorer/WorkspaceExplorer.jsx` — load-remaining button
- `backend/tests/test_auto_create_subprocess_sessions.py` — hybrid tests
- `.github/workflows/deploy-stage-ref.yml` — accurate build metadata for explicit ref deploys

## Tests
```text
20 passed, 160 warnings in 15.03s
```

## Frontend build
```text
✓ built in 18.06s
```

## PR
- [#420](https://github.com/xiaomibelov/processmap_v1/pull/420)
- Branch: `fix/hybrid-auto-subprocess` → `main`
- State: OPEN, awaiting approval

## Stage deploy
- Workflow run: https://github.com/xiaomibelov/processmap_v1/actions/runs/28256402246
- Status: success
- Verified stage frontend asset includes:
  - `Загрузить остальные`
  - `subprocesses_count`
  - `create-subprocesses`

## Known issue
`https://stage.processmap.ru/version` still reports an old commit because `.env.stage` on the stage server contains a stale `BUILD_ID`. The deployed code is current; only the `/version` metadata string is stale. PR #419 already fixes this for `deploy-stage.yml`; the same fix was applied to `deploy-stage-ref.yml` in commit `ec373c43`, but the runtime `.env.stage` value still overrides it.

## Safety
- No merge to main performed.
- No prod deploy.
- Awaiting explicit user approve before merging.
