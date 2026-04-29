# Audit: App Internal Back Forward Navigation V1

## 1. Runtime/source truth

- Contour: `audit/app-internal-back-forward-navigation-v1`
- Worktree: `/private/tmp/processmap-app-internal-back-forward-navigation-audit-v1`
- Remote: `origin git@github.com:xiaomibelov/processmap_v1.git`
- Branch: `audit/app-internal-back-forward-navigation-v1`
- HEAD: `273b185c8f37ddb53438930bc568e0243b70588c`
- origin/main: `273b185c8f37ddb53438930bc568e0243b70588c`
- Merge base: `273b185c8f37ddb53438930bc568e0243b70588c`
- Starting status: clean audit worktree.
- Main checkout was not used because this contour requires a clean branch from fresh `origin/main`.
- Audit scope: source audit plus stage runtime repro. No product code, router, history, ProcessStage, save/CAS, Explorer search/move/responsible, backend, deploy, or schema changes were made.

## 2. GSD proof

- `gsd`: unavailable.
- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`
- `gsd-sdk --version`: `gsd-sdk v0.1.0`
- `gsd-sdk query init.phase-op audit/app-internal-back-forward-navigation-v1`: completed.
- Limitation: `.planning` and GSD agents were not installed in this worktree (`agents_installed: false`), so the contour continued by GSD discipline.

## 3. Exact repro

Runtime check executed on `https://stage.processmap.ru/app` on 2026-04-29 with an authenticated stage session. Credentials were used only for the runtime check and are not recorded in this document.

Observed path:

```text
/app
-> 1. Супы ДК
-> Суп Куриный, 320 г
-> Суп куриный project
-> суп куриный session
-> browser Back
```

Runtime state snapshots:

| Step | URL | `history.length` | Visible state |
| --- | --- | ---: | --- |
| root | `https://stage.processmap.ru/app` | 2 | Workspace Explorer root with sections. |
| section | `https://stage.processmap.ru/app` | 2 | Section `1. Супы ДК` opened. |
| folder | `https://stage.processmap.ru/app` | 2 | Folder `Суп Куриный, 320 г` opened. |
| project | `https://stage.processmap.ru/app` | 2 | Project pane `Суп куриный`, session list visible. |
| session | `https://stage.processmap.ru/app?project=380a856831&session=d5e0cb4548` | 2 | ProcessStage session `суп куриный` opened. |
| browser Back | `about:blank` | n/a | Left ProcessMap instead of returning to project/session list. |

| Scenario | Expected | Actual/proof | Verdict |
| --- | --- | --- | --- |
| root -> section -> mouse back | internal section/root | Section click left URL `/app` and `history.length=2`; no section history entry was created. | Gap confirmed runtime/source-backed. |
| section -> folder -> mouse back | internal folder/section | Folder click left URL `/app` and `history.length=2`; no folder history entry was created. | Gap confirmed runtime/source-backed. |
| folder -> project -> mouse back | internal project/folder | Project pane opened while URL remained `/app` and `history.length=2`. | Gap confirmed runtime/source-backed. |
| project -> session -> mouse back | internal session/project | Session opened at `/app?project=380a856831&session=d5e0cb4548`, but `history.length` stayed 2; browser Back left ProcessMap to `about:blank`. | Gap confirmed runtime/source-backed. |
| direct session URL -> mouse back | safe browser behavior | Source supports URL restore from `?project=&session=`. If opened from outside with no internal previous state, browser back may legitimately leave app. | Expected browser behavior. |
| browser forward | internal forward if previous internal back | Source has no internal Explorer history entries to replay for workspace/folder/project/session transitions. | Missing for v1 target. |

## 4. Source map

| Area | File/function | Current behavior | History behavior | Gap |
| --- | --- | --- | --- | --- |
| Root app routing | `frontend/src/RootApp.jsx:30-36`, `95-101`, `126-137` | Small app-level router reads location, listens to `popstate`, and has a `navigate()` helper. | Uses `pushState`/`replaceState` for top-level `/app`, `/admin`, login redirects, and org/auth flow. | This is route-level, not Explorer internal navigation. |
| Session URL read/write | `frontend/src/app/useSessionRouteOrchestration.js:3-32` | Reads `project` and `session` query params and writes selected project/session to URL. | Writes with `window.history.replaceState(...)`, preserving deep-link state without adding a browser history entry. | Project/session changes do not become back/forward steps. |
| App popstate | `frontend/src/App.jsx:3237-3279` | Reads URL on popstate, updates org settings, project id, requested session id, and runs leave guard for unsafe session exit. | Handles browser history entries that already exist. | Cannot replay folder/project stack entries that were never pushed. |
| Selection URL sync | `frontend/src/App.jsx:3294-3316` | Syncs current `projectId` and `draft.session_id` to URL after state changes. | Calls `writeSelectionToUrl`, which uses `replaceState`. | Deep-link restore is protected, but navigation history is collapsed. |
| Leave guard | `frontend/src/App.jsx:1079-1099`, `2884-2915`, `3237-3279` | Reuses `deriveLeaveNavigationRisk`, confirm text, flush-before-leave, and popstate guard. | Popstate can be blocked and URL restored with current selection. | Future internal back must reuse this guard before leaving dirty ProcessStage state. |
| Workspace root/sidebar | `frontend/src/features/explorer/useWorkspaceExplorerController.js:227-233`; `WorkspaceExplorer.jsx:1016-1085` | Workspace click sets active workspace and clears folder/project state. | No URL write and no `pushState`. | Workspace switch is local state only. |
| Folder navigation | `frontend/src/features/explorer/useWorkspaceExplorerController.js:253-258`; `WorkspaceExplorer.jsx:1190-1226`, `1958-1967` | Folder open sets `currentFolderId` and clears project state. | No URL write and no `pushState`. | Mouse/browser back cannot return to previous Explorer folder/root. |
| Project navigation | `frontend/src/features/explorer/useWorkspaceExplorerController.js:260-263`; `WorkspaceExplorer.jsx:1328-1351`, `1994-1999` | Project link has an href `/app?project=...`, but client click is intercepted and `onNavigate` sets local ProjectPane state. | Runtime proof: Explorer project open left URL as `/app` and did not call `pushState`. Modified clicks can still use the href. | Direct link works, ordinary internal click is local state only and does not create a back entry. |
| ProjectPane back/breadcrumb | `frontend/src/features/explorer/WorkspaceExplorer.jsx:2450-2521`; `workspaceBreadcrumbs.js:20-39` | "Назад к разделу" and project breadcrumb call `onBack(crumb)` to restore parent folder/root. | Local state only. | Existing logic is a good target action for future `popstate`, but is not bound to browser history. |
| Session open | `frontend/src/features/explorer/WorkspaceExplorer.jsx:2138-2197`, `2288-2302`, `2433-2448`, `2620-2630`; `frontend/src/App.jsx:1101-1137` | Session rows/links open the session through `onOpenSession`; leave guard protects switching sessions. | Link href is `/app?project=...&session=...`, but ordinary client click is intercepted; URL sync uses `replaceState`. | Session open does not push a project -> session history entry. |
| Topbar project/session navigation | `frontend/src/components/AppShell.jsx:155-157`, `203-221`; `frontend/src/App.jsx:3359-3379` | Topbar project/session selection calls app callbacks; "К проекту" calls `returnToSessionList`. | Local state and guarded callbacks; no internal history push in these handlers. | Browser back behavior depends on existing browser stack, not topbar/user flow semantics. |
| App route links | `frontend/src/components/navigation/AppRouteLink.jsx:10-17`; `frontend/src/features/navigation/appLinkBehavior.js:1-17` | Plain left clicks are prevented and delegated to React handlers; modified/non-left clicks fall through to native href. | No History API write in `AppRouteLink` itself. | Future implementation needs route/history write at the navigation model boundary, not ad hoc per link. |
| Org settings | `frontend/src/app/useAppShellController.js:101-138` | Org settings opens `/app/org` with `pushState` and closes via `replaceState`. | Has a separate popstate-aware route pattern. | Shows the app can support History API, but this pattern is not generalized to Explorer. |
| Admin routes | `frontend/src/features/admin/AdminApp.jsx:34-93`, `147-149`; `frontend/src/app/router/adminRoutes.jsx:4-21` | Admin pages are URL-path based and use `onNavigate`. | Top-level route history is URL-first. | Admin is outside target scope, but demonstrates better browser-history alignment. |
| Context menu cleanup | `frontend/src/features/process/bpmn/context-menu/useBpmnContextMenuState.js:59-62` | Closes/recomputes context menu on route-like change. | Listens to popstate only for local UI cleanup. | Not an app navigation model. |

## 5. Current routing/history model

The application has a small custom router, not React Router:

- `RootApp` owns top-level path selection (`/`, `/app`, `/admin`) and updates its location state on `popstate`.
- `RootApp.navigate()` uses `pushState` for normal top-level navigation and `replaceState` for redirects.
- `AdminApp` is mostly URL-first: admin section and filters are derived from pathname/search and routed through `onNavigate`.
- ProcessMap app state is mixed:
  - deep-link restore for project/session uses query params `?project=...&session=...`;
  - `App` restores from those params and handles popstate with the existing leave guard;
  - App-level selected project/session are written back to URL with `replaceState`;
  - Explorer ProjectPane selection is separate local state and did not write `?project=` in stage repro;
  - Workspace Explorer workspace/folder/project pane state is local React state in `useWorkspaceExplorerController`.

This means direct links and refresh restore are partially supported, but internal user journeys are not represented as a browser history stack.

## 6. Mouse/browser back behavior

Mouse back and browser Back are not special app events. They trigger browser history navigation, which dispatches `popstate` only if there is a same-tab history entry to move to.

Current source behavior:

- Workspace/folder transitions do not call `pushState`.
- Project/session clicks expose real hrefs for native/modifier behavior, but normal left clicks are intercepted by `AppRouteLink` and handled in React.
- Explorer project open is local ProjectPane state and did not write the project URL in the stage repro.
- Session open writes `?project`/`?session` into the current entry; source uses `replaceState`, not `pushState`.
- Therefore the browser history entry is mutated rather than extended.
- If the previous browser entry is an external site, login page, or another app route, mouse/browser back goes there.

This is browser-native behavior, not a mouse-button bug.

## 7. Questions answered

- Is there a single router? No. There is a small custom top-level router plus local app state and a separate admin URL model.
- Is History API used? Yes, but unevenly: top-level/admin/org settings push entries; ProcessMap project/session sync replaces entries; Explorer folder state does not use it.
- Do Explorer internal transitions pushState? No source evidence found for workspace/folder/project/session internal flow.
- Does opening project change URL? Explorer project open did not change URL in stage repro; App-level/direct project selection can be represented by `?project=...`, but the normal Explorer click is local ProjectPane state.
- Does opening session change URL? Yes, after state sync, but via `replaceState`.
- Do breadcrumbs change URL/history? Explorer breadcrumbs use local handlers; project/session breadcrumb uses app callbacks. They do not push history entries.
- Does direct URL restore state? Yes for `project`/`session` query params; folder/workspace restore is not URL-addressed in source.
- Is there a popstate handler? Yes in `RootApp` and `App`.
- Why does mouse back leave app? Because internal transitions did not create browser history entries.
- What should be done? Prefer URL-first internal routing with `pushState` on semantic internal transitions and `popstate` replay, guarded by existing ProcessStage leave guard.
- Where not to intercept back? Text inputs, modal/dropdown local dismissal unless explicitly routed, unsafe ProcessStage leave, and native modified/non-left link clicks.
- How to preserve deep links? Keep `?project=&session=` restore and add a compatible Explorer route/query schema rather than replacing it blindly.

## 8. Target behavior

Explorer target:

```text
Workspace root -> Section -> Folder -> Project

Back:
Project -> Folder -> Section -> Workspace root

Forward:
Workspace root -> Section -> Folder -> Project
```

Session target:

```text
Project -> Session

Back:
Session -> Project
```

If ProcessStage has unsafe local state:

- browser/mouse back must run the existing leave guard;
- if the user cancels, stay in session and restore the URL/current state;
- if safe or confirmed, leave session according to the target route.

Direct link target:

- opening `/app?project=...&session=...` directly must still restore the session after reload;
- if there is no internal previous state, the first browser back may leave the app;
- optional future enhancement: seed a parent project entry after context is known, but only if it does not break native expectations.

Modals/dropdowns:

- v1 should not introduce modal routing.
- If a component already closes itself on route-like changes, preserve that behavior.

## 9. Verdicts

| Verdict | Evidence | Implication | Recommended implementation |
| --- | --- | --- | --- |
| `INTERNAL_NAVIGATION_NOT_PUSHING_HISTORY` | Explorer state changes in `useWorkspaceExplorerController.js:227-283`; session/project URL sync uses `replaceState` in `useSessionRouteOrchestration.js:16-32`. | Browser stack has no internal Explorer steps. | Add a central app navigation model that pushes semantic internal route states. |
| `PROJECT_NAVIGATION_LOCAL_STATE_ONLY` | `ProjectRow` href is present, but `AppRouteLink` prevents plain left click and calls `onNavigate`; `handleNavigateToProject` only sets `currentProjectId`. Stage project open kept URL `/app`. | Project open is not addressable in browser history during ordinary Explorer navigation. | Route project open through a URL/history-aware coordinator. |
| `SESSION_NAVIGATION_URL_ONLY_OR_REPLACE` | `SessionRow` links build `/app?project=&session=`, but intercepted clicks call `onOpen`; `App` later calls `writeSelectionToUrl` with `replaceState`. | Session direct link works, internal project -> session back step is missing. | Push project -> session entries for internal opens while preserving direct href fallback. |
| `POPSTATE_HANDLER_MISSING` | `App.jsx:3237-3279` has a popstate handler. | Not missing globally; insufficient because Explorer stack entries are missing and folder/workspace route state is not encoded. | Extend handler/model to understand internal Explorer route states. |
| `MOUSE_BACK_USES_BROWSER_HISTORY_AS_EXPECTED` | Browser buttons act on history; source does not push entries for most target transitions. | Mouse back leaving app is expected from current source. | Do not fix with mouse-button interception. Fix history model. |
| `GLOBAL_MOUSE_BUTTON_INTERCEPT_NOT_RECOMMENDED` | Existing `shouldHandleClientNavigation` explicitly preserves native non-left/modified link behavior. | Global interception would fight browser semantics and text/input/modifier expectations. | Keep native browser behavior; make browser history contain the right internal entries. |
| `URL_FIRST_INTERNAL_ROUTING_RECOMMENDED` | Admin and org settings already use URL-derived routing with History API; app deep links already use `?project=&session=`. | A URL/history model fits the codebase better than a hidden stack. | Define a single ProcessMap route shape for workspace/folder/project/session and use `pushState` for semantic user navigation. |
| `LEAVE_GUARD_MUST_BLOCK_UNSAFE_BACK` | `confirmLeaveIfUnsafe` is used for popstate, project changes, session changes, and return to project. | Back/forward could otherwise lose or conflict ProcessStage changes. | Reuse existing leave guard and flush policy in all route transitions that leave/switch sessions. |
| `DIRECT_DEEP_LINK_RESTORE_MUST_STAY` | `readSelectionFromUrl`, `refreshProjects`, `refreshSessions`, and URL restore tests cover project/session query restore. | Any routing change must preserve reload/deep-link behavior. | Keep backward-compatible query params or add migration parsing for new route state. |

## 10. Recommended implementation stack

1. `feature/app-url-history-navigation-model-v1`
   - Define one internal route model for ProcessMap app: workspace, folder, project, session.
   - Keep backward-compatible parsing of `/app?project=...&session=...`.
   - Add a single navigation coordinator that decides `pushState` vs `replaceState`.
   - Update `popstate` replay to drive app state from route state.
   - Keep native href behavior for modifier clicks and direct links.

2. `fix/explorer-browser-back-forward-navigation-v1`
   - Route Workspace Explorer semantic transitions through the coordinator:
     - workspace select;
     - section/folder open;
     - breadcrumb click;
     - project open;
     - project back.
   - Reuse existing breadcrumb resolution (`resolveProjectBreadcrumbTarget`) as the local transition implementation.
   - Add tests for root -> folder -> project -> back/forward.

3. `fix/processstage-browser-back-to-project-v1`
   - Route project -> session open through the coordinator.
   - On back from session, return to ProjectPane/session list.
   - Reuse `confirmLeaveIfUnsafe` and `returnToSessionList` semantics.
   - Block/cancel popstate on dirty/conflict/save-failed states.

4. Optional: `uiux/app-navigation-back-forward-buttons-v1`
   - Add visible in-app back/forward controls only if product needs them.
   - These should call the same navigation coordinator as browser/mouse buttons.

## 11. Risks

- Double logic risk: URL state and React state can diverge if route parsing and setter paths are not centralized.
- Deep-link risk: changing query shape without compatibility can break existing shared links.
- Leave guard risk: popstate is asynchronous from user perspective; cancelling must restore both URL and visible session.
- Explorer restore risk: folders are loaded lazily, so folder/project route replay may need bounded loading states.
- Search result risk: search opens folders/projects/sessions through the same local handlers and must use the same history model.
- Native link risk: middle-click, ctrl/cmd-click, target handling, and direct reload should remain browser-native.

## 12. Validation plan

Audit-only validation:

- `git diff --check`
- `git diff --cached --check`
- `git status -sb`

Future implementation validation:

- Open Workspace Explorer, navigate root -> section -> folder -> project, browser Back returns project -> folder -> section -> root.
- Browser Forward replays root -> section -> folder -> project.
- Open project -> session, browser Back returns to project/session list.
- Dirty ProcessStage back shows existing leave guard and cancel keeps the session open.
- Direct `/app?project=...&session=...` reload still restores the session.
- Modified clicks on project/session links still use native browser behavior.
- Search result navigation participates in the same history model.
- Admin routes and org settings popstate behavior unchanged.

## 13. Final conclusion

The bug is not that mouse back is unhandled. Mouse/browser back is doing the browser-native thing. The application does not push internal Workspace Explorer and ProcessStage navigation states into browser history, so the previous browser entry is often outside ProcessMap.

Recommended path: do not intercept mouse buttons globally. Add a URL-first internal navigation model that pushes semantic app route entries for Explorer and session transitions, then teach `popstate` to replay those states through existing navigation and leave-guard contracts.
