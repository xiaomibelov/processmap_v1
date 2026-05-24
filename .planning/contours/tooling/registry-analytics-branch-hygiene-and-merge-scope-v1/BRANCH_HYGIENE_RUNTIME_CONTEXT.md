# BRANCH_HYGIENE_RUNTIME_CONTEXT

## Обязательный контекст Agent 1

| Проверка | Результат |
|---|---|
| `pwd` | `/opt/processmap-test` |
| `git fetch origin` | выполнен успешно |
| branch | `fix/lockfile-sync-test` |
| `HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --cached --name-only` | пусто |
| `git diff --name-only` | 20 tracked frontend files |
| `git status -sb` | dirty checkout with many untracked files |

## Remote handling

`git remote -v` был проверен. В отчётах remote должен печататься только sanitized как `github.com/xiaomibelov/processmap_v1.git`, без embedded credentials.

## Tracked dirty files observed by Agent 1

```text
frontend/src/app/processMapRouteModel.js
frontend/src/components/AppShell.jsx
frontend/src/components/ProcessStage.jsx
frontend/src/components/TopBar.jsx
frontend/src/components/process/BpmnStage.jsx
frontend/src/components/process/InterviewStage.jsx
frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs
frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
frontend/src/config/appVersion.js
frontend/src/features/explorer/WorkspaceExplorer.jsx
frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js
frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js
frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx
frontend/src/styles/app/02/02-02-bpmn-viewer-core.css
frontend/src/styles/app/02/02-06-bpmn-dark-theme.css
frontend/src/styles/app/05/05-02-bpmn-text-contrast.css
frontend/src/styles/app/06-final-structure.css
frontend/src/styles/legacy/legacy_bpmn.css
frontend/src/styles/tailwind.css
```

## Untracked risk classes observed by Agent 1

- `.agents/` and `.planning/contours/`: agent/planning artifacts.
- `PROCESSMAP/HANDOFF/*.md`: handoff/evidence notes.
- screenshots such as `reviewer-*.png`, `analytics-hub-*.png`, `diagram_*.png`: evidence only.
- `frontend/public/`, `frontend/src/generated/`: generated/public assets requiring careful classification.
- `tools/pm-agent*.sh`, `tools/rag/`, `bin/`: tooling/agent infra.
- `.env.backup_*`: secrets-adjacent; do not read/print contents.

## GSD status

- `command -v gsd` returned `/opt/processmap-test/bin/gsd`.
- `gsd usage` returned `Error: Unknown command: usage`.
- `gsd` without args returned command usage for `gsd-tools`.
- GSD skills directory contains `gsd-*` skills.

## Runtime-reviewed facts to preserve

- Analytics Hub REVIEW_PASS.
- Registry redesign REVIEW_PASS.
- Runtime `:5180` served reviewed sha `5b20bc2`.
- Visible version in final Registry review: `v1.0.137`.
- Empty scope shell and populated project scope behavior must survive isolation.
