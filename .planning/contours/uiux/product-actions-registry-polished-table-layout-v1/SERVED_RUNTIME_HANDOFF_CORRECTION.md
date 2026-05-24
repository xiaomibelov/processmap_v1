# Served Runtime Handoff Correction

Contour: `uiux/product-actions-registry-polished-table-layout-v1`
Run ID: `20260518T101901Z-54062`
Date: `2026-05-18T10:42:28Z`
Prepared by: manual Agent 3 correction

## Reason

Agent 3 automatic runtime handoff selected the wrong worktree: `/opt/processmap-test-agent2-uiux-layout`.
That made `/build-info.json` carry the current contour id but the wrong branch/SHA/sourceWorktree.

## Correct Source

- Worktree: `/opt/processmap-product-actions-polished-table-part1`
- Frontend: `/opt/processmap-product-actions-polished-table-part1/frontend`
- Branch: `uiux/product-actions-registry-polished-table-layout-v1-part1`
- SHA: `3836a32c9d7ff67c0dd44811e31e98d87f609675`
- Dirty: `false`

## Served Runtime

- Served dist: `/opt/processmap-test/frontend/dist`
- Previous served dist backup: `/opt/processmap-test/frontend/dist.backup-manual-correct-worktree-20260518T104228Z`
- Verification: `http://127.0.0.1:5180/build-info.json`

```json
{"branch":"uiux/product-actions-registry-polished-table-layout-v1-part1","sha":"3836a32c9d7ff67c0dd44811e31e98d87f609675","shaShort":"3836a32","timestamp":"2026-05-18T10:42:28Z","contourId":"uiux/product-actions-registry-polished-table-layout-v1","dirty":false,"host":"clearvestnic.ru","sourceWorktree":"/opt/processmap-product-actions-polished-table-part1","preparedBy":"manual-agent3-runtime-correction","runId":"20260518T101901Z-54062"}
```
