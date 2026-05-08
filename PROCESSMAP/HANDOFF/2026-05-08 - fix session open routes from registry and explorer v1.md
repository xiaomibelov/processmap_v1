# 2026-05-08 - fix session open routes from registry and explorer v1

## Где мы / зачем

Контур: `fix/session-open-routes-from-registry-and-explorer-v1`.

Regression: клики по session из Explorer/Workspace/реестра снова могли приводить к parent project/workspace scope, а не к конкретной session. Нужно вернуть контракт v1.0.105: project affordance открывает project, session affordance открывает session с первого клика.

## Что стало видимым

- Explorer session row/title/CTA передают explicit session-open intent.
- Workspace dashboard session row/title/CTA открывают session напрямую.
- Реестр действий с продуктом: session row и `Открыть сессию` открывают конкретную session, `Открыть проект` остаётся project drilldown.
- Session entry из списков/drilldown запрашивает `Diagram (BPMN)` через `openTab: "diagram"`.
- CTA внутри строк останавливают parent bubbling там, где это могло смешать project/session navigation.

## GSD status

| Check | Result |
| --- | --- |
| GSD CLI | `GSD_UNAVAILABLE`: `gsd` not found |
| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
| SDK route query | unsupported |
| SDK phase-ready query | unsupported |
| Route | manual bounded GSD fallback |

## Source truth

| Field | Value |
| --- | --- |
| Worktree | `/tmp/processmap_session_open_routes_registry_explorer_v1` |
| Branch | `fix/session-open-routes-from-registry-and-explorer-v1` |
| Base / origin/main / merge-base | `f82e8cf347a1d5bf67e3f277b7ca990e5efbf52d` |
| Main dependency | includes PR #313 `fix: handle product actions ai parse errors` |
| Merge/deploy/PR | not performed in this contour |

## Runtime repro

User-provided stage repro is accepted as runtime signal: clicking session opened parent project/workspace first.

No authenticated stage runtime was executed from this worktree because merge/deploy are out of scope. Source-map confirmed the likely routes where session intent could be dropped or misdirected.

## Root cause

| Area | Root |
| --- | --- |
| Explorer session rows | `SessionRow` created row/title/CTA intents, but parent `ProjectPane` wrapper did not forward the options, so explicit source/openTab could be dropped. |
| Explorer search result | session result open did not pass explicit Diagram entry intent. |
| Workspace dashboard | session rows and title were not consistently direct session-open affordances; action menu needed bubbling protection. |
| Product actions registry | session summary CTA requested Analysis/interview tab and row-level session click was not explicit; project/session controls needed stricter propagation boundaries. |
| ProcessStage registry bridge | normalized ids were computed but not fully passed through as the session payload. |

## Navigation fix

Changed files:

- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/components/workspace/WorkspaceDashboard.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/explorer/workspaceOpenAffordance.source.test.mjs`
- `frontend/src/features/process/hooks/useProcessTabs.session-entry-tab.test.mjs`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`

Behavior:

- project open remains project-only;
- session row/title/CTA opens session directly;
- registry `Открыть проект` and `Открыть сессию` are separate;
- list/drilldown session entry uses `openTab: "diagram"`;
- explicit in-session tab memory remains unchanged when there is no explicit entry intent.

## Tests / build

| Check | Result |
| --- | --- |
| Targeted frontend tests | `node --test frontend/src/features/explorer/workspaceOpenAffordance.source.test.mjs frontend/src/features/process/hooks/useProcessTabs.session-entry-tab.test.mjs frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` -> 19 passed |
| `git diff --check` | pass |
| Frontend build | `npm --prefix frontend run build` -> pass after local `npm --prefix frontend ci`; existing Vite chunk-size warning |

Note: `npm ci` reported existing audit findings: 7 vulnerabilities (4 moderate, 3 high). No audit fix was run.

## Obsidian updates

Updated:

- `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md`
- `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md`
- `PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md`
- `PROCESSMAP/PROJECT ATLAS/15_Backlog контуров.md`
- `PROCESSMAP/PROJECT ATLAS/16_Журнал решений.md`

## Commit / push status

Commit: `fix: open sessions directly from registry and explorer`
Push: prepared for `origin/fix/session-open-routes-from-registry-and-explorer-v1`.
PR: not created.

## Explicit unchanged

- AI: no changes.
- `product_actions`: no save/data model changes.
- BPMN XML: no changes.
- CSV/XLSX export: no changes.
- Generic autosave: no changes.
- Broad Explorer redesign: no.
- Merge/deploy: no.
