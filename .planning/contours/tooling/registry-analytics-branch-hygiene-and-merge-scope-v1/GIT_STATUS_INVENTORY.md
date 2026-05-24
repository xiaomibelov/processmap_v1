# GIT_STATUS_INVENTORY

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Run ID: `20260517T191023Z-10717`

## Source truth

| Проверка | Результат |
|---|---|
| `pwd` | `/opt/processmap-test` |
| remote | `github.com/xiaomibelov/processmap_v1.git` credentials redacted |
| `git fetch origin` | выполнен успешно |
| branch | `fix/lockfile-sync-test` |
| `HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| staged files | отсутствуют |
| tracked dirty files | 20 |
| untracked files | 2622 |

## Tracked dirty files

```text
M frontend/src/app/processMapRouteModel.js
M frontend/src/components/AppShell.jsx
M frontend/src/components/ProcessStage.jsx
M frontend/src/components/TopBar.jsx
M frontend/src/components/process/BpmnStage.jsx
M frontend/src/components/process/InterviewStage.jsx
M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs
M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
M frontend/src/config/appVersion.js
M frontend/src/features/explorer/WorkspaceExplorer.jsx
M frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js
M frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js
M frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx
M frontend/src/styles/app/02/02-02-bpmn-viewer-core.css
M frontend/src/styles/app/02/02-06-bpmn-dark-theme.css
M frontend/src/styles/app/05/05-02-bpmn-text-contrast.css
M frontend/src/styles/app/06-final-structure.css
M frontend/src/styles/legacy/legacy_bpmn.css
M frontend/src/styles/tailwind.css
```

Diffstat: `20 files changed, 1036 insertions(+), 474 deletions(-)`.

## Untracked inventory summary

`git ls-files -o --exclude-standard` returned 2622 paths.

| Prefix | Count | Primary class |
|---|---:|---|
| `.planning/` | 1128 | D/E depending contour; current contour D |
| `.playwright-mcp/` | 1110 | E |
| `.agents/` | 212 | D |
| `tools/` | 51 | D |
| `frontend/` | 36 | A/B/C/F depending file |
| `PROCESSMAP/` | 6 | E |
| `bin/` | 5 | D |
| `scripts/` | 3 | C/D |
| root screenshots/review artifacts | 56 | E |
| `.env.backup_20260514_095731` | 1 | F |

## Safety notes

- `.env.backup_20260514_095731` was not read.
- No destructive git command was run.
- No push, PR, merge, deploy, or cleanup was run.
