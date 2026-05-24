# Runtime and source truth

## Commands captured

- `pwd` -> `/opt/processmap-test`
- `command -v gsd` -> `/opt/processmap-test/bin/gsd`
- `gsd usage` -> unsupported subcommand: `Error: Unknown command: usage`
- `gsd` -> usage printed for `gsd-tools <command>`
- `git fetch origin` -> success
- `git branch --show-current` -> `fix/lockfile-sync-test`
- `git rev-parse HEAD` -> `5b20bc2d1292f419647238eaf37dac55f9315942`
- `git rev-parse origin/main` -> `d805e1c64c1107b9e3fe6854e031694bf741b187`
- `git diff --cached --name-only` -> empty

## Remote

Remote is `origin` pointing to `xiaomibelov/processmap_v1.git`. Full credential-bearing URL is intentionally not reproduced in this report.

## Working tree

`git status -sb` shows dirty tree on `fix/lockfile-sync-test`, including modified product-code files and many untracked artifacts. Relevant modified product-code examples:

- `frontend/src/app/processMapRouteModel.js`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/components/TopBar.jsx`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/components/process/InterviewStage.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`
- `frontend/src/styles/tailwind.css`

## Planning verdict

For product implementation this checkout is not clean and does not match the canonical new-work-from-origin-main rule. For this contour, the work is limited to planning artifacts under:

`.planning/contours/architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1/`

No product-code, backend-code, durable data, PR, merge or deploy is part of this contour.
