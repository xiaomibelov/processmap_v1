# Audit: Workspace Explorer hierarchy, navigation, ownership, search, sort v1

Contour: `audit/workspace-explorer-hierarchy-navigation-ownership-search-sort-v1`

## Runtime/source truth

| Item | Value |
| --- | --- |
| Repo/worktree | `/private/tmp/processmap-workspace-explorer-audit-v1` |
| Remote | `origin git@github.com:xiaomibelov/processmap_v1.git` |
| Branch | `audit/workspace-explorer-hierarchy-navigation-ownership-search-sort-v1` |
| HEAD | `9129a72fa89d4dc3c67d5c01efec157d9b0c6edd` |
| origin/main | `9129a72fa89d4dc3c67d5c01efec157d9b0c6edd` |
| merge-base | `9129a72fa89d4dc3c67d5c01efec157d9b0c6edd` |
| Bootstrap status | clean worktree from `origin/main`; original checkout was dirty, so it was not touched |
| App version | `v1.0.43` in `frontend/src/config/appVersion.js` |
| Main surface | Workspace Explorer (`frontend/src/features/explorer/WorkspaceExplorer.jsx`) |
| Folder/root API | `GET /api/explorer` |
| Project view API | `GET /api/projects/{project_id}/explorer` |
| Local runtime | not started; audit-only source map |
| Stage runtime | not used; audit-only and no stage auth/data mutation |

## GSD proof

`gsd` standalone was not available. `gsd-sdk` was available at `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, version `v0.1.0`.

`gsd-sdk query init.phase-op audit/workspace-explorer-hierarchy-navigation-ownership-search-sort-v1` returned project context but no initialized `.planning` workspace in this clean worktree (`planning_exists: false`, `roadmap_exists: false`, `agents_installed: false`). Per contour rules, this audit continues by GSD discipline manually: source truth first, then source-backed verdicts, no product code changes.

## Current Explorer source map

| Area | File/function | Current behavior | Gap |
| --- | --- | --- | --- |
| Explorer route/component | `frontend/src/features/explorer/WorkspaceExplorer.jsx:1-14`, `1660-1771` | Finder-like UI: Workspaces -> Folders -> Projects -> Sessions. Explorer pane stays mounted while project pane is shown. | Project navigation state is split between ExplorerPane and controller; project breadcrumb path is not reliably populated. |
| Workspace root model | `backend/app/routers/explorer.py:449-534` | `GET /api/explorer?workspace_id=...&folder_id=` returns workspace context, workspace breadcrumb and root items. | Root is a workspace, not a section. Top-level folders are just folders with `parent_id=''`. |
| Folder model | `backend/app/storage.py:1445-1459`, `7522-7573` | `workspace_folders` adjacency list; `parent_id=''` means root; fields: id, org, workspace, parent, name, sort_order, created_by, timestamps, archive marker. | No durable `section`, `status`, `owner_user_id`, or `responsible_user_id` for folders/sections. |
| Project model | `backend/app/models.py:108-129`, `backend/app/storage.py:8033-8072` | Projects have `workspace_id`, `folder_id`, `owner_user_id`, flexible `passport`. New Explorer projects must be created inside a non-empty folder. | No move/reparent endpoint for projects found. Create body accepts `owner_user_id`, but storage sets project owner to actor. |
| Session model | `backend/app/models.py:68-103`, `backend/app/storage.py:8160-8200` | Sessions belong to projects via `project_id`; Explorer session rows expose owner and `interview.status`. | No session move endpoint found; status is session-specific. |
| Breadcrumb/navigation | `WorkspaceExplorer.jsx:508-525`, `978-988`, `1396-1518`; controller `useWorkspaceExplorerController.js:26-30`, `247-274` | Folder/root view renders reusable `Breadcrumb` from `/api/explorer`. Project view renders a navigation header using `breadcrumbBase`. | `breadcrumbBase` is initialized/cleared but never set from the current folder page when opening a project. Project API returns no breadcrumbs. |
| Create folder/project/session | `WorkspaceExplorer.jsx:990-1013`, `1135-1159`, `1547-1652`; API wrappers `explorerApi.js:33-65`, `126-130` | Folder can be created at root or inside folder; project button only active inside folder; session can be created only inside project. | UI label says "Папка" at top level, not "Раздел". |
| Move/reparent support | `explorerApi.js:47-52`; `backend/app/routers/explorer.py:620-653`; `storage.py:7662-7714` | Folder move API and frontend wrapper exist. Backend validates target and prevents cycles. | No UI action uses it. No project/session move API found. |
| Status fields | `workspacePermissions.js:43-49`; `WorkspaceExplorer.jsx:211-229`, `1236-1280`; `storage.py:7881`, `8192` | Manual session statuses: draft, in_progress, review, ready, archived. Projects expose `passport.status` with default `active`. Folder status renders dash. | Folder/section status missing. Project status semantics differ from proposed product statuses. |
| Owner/responsible fields | `models.py:98`, `123`; `WorkspaceExplorer.jsx:722-725`, `1286-1289`, `1531-1534`; `storage.py:1448-1459` | Projects and sessions have `owner_user_id`; folder only has `created_by`. Org member directory exists. | Responsible for section/folder is schema/API work. Project owner assignment/update is not cleanly supported as a first-class Explorer action. |
| User directory source | `frontend/src/lib/apiModules/orgApi.js:165-172`; `backend/app/routers/org_members.py:12-14`; `services/org_workspace.py:154-175` | `/api/orgs/{org_id}/members` returns org members with email, full_name, job_title for allowed roles. Admin users endpoint also exists. | Explorer currently does not import/use a user picker. Read permission is restricted to org owner/admin/auditor. |
| Search/filter | `WorkspaceExplorer.jsx:1021-1099`, `1571-1639`; `explorerApi.js:29-31`, `68-70` | Explorer and project tables have no search input. API wrappers expose no search params. | Current payload supports only visible/loaded client filtering. Whole-workspace smart search needs backend/index or expensive BFS traversal. |
| Sort/order | `storage.py:7800-7813`, `7900-7906`, `8168-8181`; `WorkspaceExplorer.jsx:1038-1051`, `1586-1614` | Backend orders folders by sort_order/name, projects by activity/title, sessions by updated_at. Headers are static. | No user-controlled sorting, no persisted preference. Some requested sort keys need missing status/responsible fields for folders. |
| API/backend storage | `backend/app/routers/explorer.py`, `backend/app/storage.py` | Explorer has dedicated folder/project/session list/create/rename/delete endpoints and folder move endpoint. | Backend has no complete hierarchy contract for section/responsible/status/move all entities. |
| Tests | `frontend/src/features/explorer/workspaceRestore.test.mjs:1-55`; rg found no move/breadcrumb Explorer integration tests | Restore helpers have small unit tests. | Missing tests for project breadcrumb path, section labels, move dialog, search, and sorting. |

## Navigation/breadcrumb verdict

Current folder navigation is source-backed: `/api/explorer` builds breadcrumbs from workspace plus folder crumbs (`backend/app/routers/explorer.py:468-480`), and ExplorerPane renders them (`WorkspaceExplorer.jsx:978-988`).

Project view has a breadcrumb-like header (`WorkspaceExplorer.jsx:1491-1517`) and receives `breadcrumbBase` (`WorkspaceExplorer.jsx:1761`). However, controller state only initializes and clears `breadcrumbBase` (`useWorkspaceExplorerController.js:26-30`, `95-103`, `222-228`) and does not set it when opening a project (`useWorkspaceExplorerController.js:253-255`). That explains why the project/deep level can feel like a dead end: the UI shell exists, but the folder path is not wired.

Direct project restoration is weaker: `apiFindProjectWorkspace` does a BFS only to find the workspace id (`explorerApi.js:91-124`), while `GET /api/projects/{project_id}/explorer` returns only `project` and `sessions` (`backend/app/routers/explorer.py:759-813`). It does not return breadcrumbs.

Verdicts:

- `PROJECT_BREADCRUMB_MISSING_FRONTEND_ONLY` for normal navigation from folder/root into a project: pass the current `page.breadcrumbs` into controller when `onNavigateToProject` is called.
- `PROJECT_NAVIGATION_REQUIRES_ROUTE_STATE` if the product wants deep links to restore the last folder path without another backend call.
- `PROJECT_NAVIGATION_REQUIRES_BACKEND_CONTEXT` if a direct project URL must always show canonical workspace/folder breadcrumbs independent of prior Explorer state.

## Type hierarchy verdict

Durable types today:

- Workspace: returned by `GET /api/workspaces` and used as Explorer root.
- Folder: `workspace_folders` with adjacency `parent_id`; root-level folder is `parent_id=''` (`backend/app/storage.py:1445-1459`).
- Project: `projects.workspace_id` + `projects.folder_id` (`backend/app/models.py:127-128`).
- Session: `sessions.project_id` (`backend/app/models.py:73`).

There is no durable `section` type. The current system already enforces most of the desired creation hierarchy:

- folder can be created at workspace root or inside a folder (`WorkspaceExplorer.jsx:990-997`, `1135-1144`);
- project creation is disabled at workspace root and allowed only when `folderId` is present (`WorkspaceExplorer.jsx:998-1013`, `1152-1157`);
- backend rejects project creation without a folder (`backend/app/storage.py:8042-8052`);
- session creation is only under project Explorer endpoint (`WorkspaceExplorer.jsx:1547-1652`, `backend/app/routers/explorer.py:819-865`).

Top-level folder can be displayed as "Раздел" frontend-only when the current parent/root context proves `parent_id=''`. That is an alias, not a new product type. If sections need separate owner/status/permissions/lifecycle rules, a durable type or explicit field is required.

Verdicts:

- `SECTION_IS_DISPLAY_ALIAS_FOR_TOP_LEVEL_FOLDER` is feasible for labels and UI copy.
- `SECTION_REQUIRES_DURABLE_TYPE` if sections need different stored attributes, permissions, or lifecycle from folders.
- `HIERARCHY_RULES_FRONTEND_ONLY` is enough for display/create affordances already backed by current create validation.
- `HIERARCHY_RULES_REQUIRE_BACKEND_VALIDATION` for move/reparent across all entity types and for any future section-specific invariant.

## Move/reparent verdict

Folder move exists:

- frontend wrapper `apiMoveFolder(workspaceId, folderId, newParentId)` (`frontend/src/features/explorer/explorerApi.js:47-52`);
- backend endpoint `POST /api/folders/{folder_id}/move` (`backend/app/routers/explorer.py:620-653`);
- storage validates self-move, target parent existence, cycle prevention, and name uniqueness (`backend/app/storage.py:7662-7714`).

Folder move UI does not exist: `FolderRow` menu includes open, expand/collapse, rename, delete only (`WorkspaceExplorer.jsx:583-588`), and `apiMoveFolder` is not imported into `WorkspaceExplorer.jsx` (`WorkspaceExplorer.jsx:18-27`). `IcoMove` exists but is unused (`rg` only finds the icon definition).

No source-backed project or session move endpoint was found. `PATCH /api/projects/{project_id}` only updates `title` and merges `passport` (`backend/app/_legacy_main.py:8692-8726`); it does not update `folder_id` or `owner_user_id`. Session patch is used for status/name, not project reparenting.

Verdicts:

- `MOVE_API_EXISTS_UI_MISSING` for folders only.
- `MOVE_REQUIRES_BACKEND_API` for projects and sessions.
- `MOVE_REQUIRES_HIERARCHY_VALIDATION` for rules like "section cannot move into folder", "project cannot move into project", "session cannot move outside project".
- `MOVE_FRONTEND_ONLY_NOT_SAFE` for anything beyond calling the existing folder move API.

## Responsible/owner verdict

Projects and sessions already expose owner fields:

- `Project.owner_user_id` (`backend/app/models.py:123`);
- `Session.owner_user_id` (`backend/app/models.py:98`);
- Explorer project/session rows render owner (`WorkspaceExplorer.jsx:722-725`, `1286-1289`, `1531-1534`).

Folders/sections do not have owner/responsible fields. `workspace_folders` stores `created_by`, but that is an audit/creation field, not an assignable responsible person (`backend/app/storage.py:1448-1459`).

There is a user directory source: `apiListOrgMembers` calls `/api/orgs/{org_id}/members` (`frontend/src/lib/apiModules/orgApi.js:165-172`), and backend enriches members with email/full_name/job_title (`backend/app/services/org_workspace.py:154-175`). The access guard allows reading member list only for platform admin or org owner/admin/auditor (`backend/app/services/org_workspace.py:23-24`, `154-162`), so product/permissions decisions are needed if editors/project managers must assign responsible users.

Project create accepts `owner_user_id` in the Explorer wrapper/body (`explorerApi.js:61-65`, `backend/app/routers/explorer.py:187-190`), but router only writes it into `passport` (`backend/app/routers/explorer.py:709-716`) while storage sets the durable project `owner_user_id` to the actor (`backend/app/storage.py:8053`, `8064-8069`). That should not be treated as a reliable current responsible assignment feature.

Verdicts:

- `RESPONSIBLE_FIELD_MISSING_SCHEMA_REQUIRED` for sections/folders.
- `RESPONSIBLE_USER_DIRECTORY_EXISTS`, but permissions for using it in Explorer need confirmation.
- `RESPONSIBLE_ASSIGNMENT_FRONTEND_ONLY_NOT_SAFE`.
- `RESPONSIBLE_INHERITANCE_PRODUCT_DECISION_REQUIRED`: inheritance section -> folder -> project -> session is not represented now and must be decided explicitly.

Recommended storage shape if product approves responsible ownership:

- `responsible_user_id`;
- optional display snapshot (`responsible_name`, `responsible_email`) only if needed for historical rendering;
- `responsible_assigned_at`;
- `responsible_assigned_by`;
- explicit inheritance rule or independent field per entity.

## Status model verdict

Session statuses exist and match the user's proposed set:

- `draft` / Черновик;
- `in_progress` / В работе;
- `review` / На проверке;
- `ready` / Готово;
- `archived` / Архив.

They are defined in `frontend/src/features/workspace/workspacePermissions.js:43-49`, rendered/edited in `WorkspaceExplorer.jsx:1236-1280`, and read from `session.interview.status` in Explorer storage (`backend/app/storage.py:8192`).

Projects have a loose `passport.status`, defaulting to `active` (`backend/app/storage.py:7881`; `backend/app/routers/explorer.py:784`). `StatusBadge` knows some project-ish statuses such as `active`, `on_hold`, `done`, `completed` (`WorkspaceExplorer.jsx:211-229`), which do not equal the proposed session workflow. Folders/sections render a dash (`WorkspaceExplorer.jsx:632`) and have no stored status.

Verdicts:

- `SESSION_STATUS_EXISTS`.
- `FOLDER_PROJECT_STATUS_MISSING` for the requested product model: folder/section missing completely; project has only loose/passport status with different semantics.
- `STATUS_REUSE_NEEDS_PRODUCT_DECISION`: reusing session statuses for projects/folders is a product decision, not an obvious technical default.
- `STATUS_SCHEMA_REQUIRED` if status must be durable/searchable/sortable on folders/sections and first-class on projects.

## Smart search verdict

No Explorer search UI or Explorer search API was found. The root/folder table renders visible rows from current `page.items` and inline-loaded folder children (`WorkspaceExplorer.jsx:896-910`, `1021-1099`). Project view renders only current project sessions (`WorkspaceExplorer.jsx:1571-1639`). `apiGetExplorerPage` and `apiGetProjectPage` expose no search query (`explorerApi.js:29-31`, `68-70`).

There is a separate backend workspace snapshot query with `q`, owner, and date filters over projects/sessions (`backend/app/storage.py:6216-6338`), but it does not include folders/sections or path breadcrumbs and is not wired to Explorer.

Frontend-only search is feasible for the currently visible/loaded payload:

- name/title;
- type;
- project owner, project status, updated/created timestamps;
- session name/status/stage/owner in project view.

It is not enough for whole workspace search if collapsed/unloaded folders should be searched. That needs either a backend endpoint/index or an explicit client traversal strategy with loading/performance constraints.

Verdicts:

- `EXPLORER_SEARCH_FRONTEND_FEASIBLE_CURRENT_PAYLOAD`.
- `EXPLORER_SEARCH_REQUIRES_BACKEND_INDEX` for whole workspace/all accessible org objects at scale, and for folders plus parent paths.
- `SMART_SEARCH_SCOPE_PRODUCT_DECISION_REQUIRED`: choose current folder, current section, whole workspace, or all accessible org objects.

## Sorting verdict

Current sorting is backend/default only:

- folders: `sort_order ASC, name ASC` in SQL and child sort by `sort_order`, lower name (`backend/app/storage.py:7800-7803`, `7838-7844`);
- projects: SQL `updated_at DESC, title ASC`, then displayed per folder by `rollup_activity_at DESC`, title (`backend/app/storage.py:7806-7813`, `7900-7906`);
- sessions: `updated_at DESC` (`backend/app/storage.py:8168-8181`).

Explorer table headers are static (`WorkspaceExplorer.jsx:1038-1051`, `1586-1614`). No persisted sort preference or URL/state sort parameter was found.

Frontend-only sorting is feasible for loaded rows by available fields:

- name/title;
- type;
- updated/created timestamps where present;
- project/session status;
- project/session owner.

Sorting by responsible/status for folders/sections is blocked until those fields exist or derived rules are approved. Whole-workspace sorting across unloaded nested children needs backend support or full traversal.

Verdicts:

- `EXPLORER_SORT_FRONTEND_FEASIBLE` for loaded current payload.
- `EXPLORER_SORT_REQUIRES_BACKEND_FIELDS` for responsible/status on sections/folders and whole-workspace sorting.
- `SORT_PERSISTENCE_OPTIONAL`: product should choose per-folder, per-workspace, or global preference.

## Product decisions required

1. Is `Раздел` only a UI alias for top-level folder, or a durable type with separate status/responsible/permissions?
2. Should project breadcrumb on direct URL be canonical and always available? If yes, backend should return project workspace/folder breadcrumbs.
3. Which entities are movable in v1: folders only, folders + projects, or folders + projects + sessions?
4. Who can move entities: same as `can_edit_workspace`, admin-only, or per-entity owner/responsible?
5. Is "responsible" independent on each entity or inherited down the hierarchy?
6. Can editors/project managers read org member directory for responsible assignment, or is assignment admin-only?
7. Should project/folder/section statuses reuse session statuses, use separate statuses, or show derived status from children?
8. Search scope: current folder only, current section, whole workspace, or all accessible org objects.
9. Sort persistence: no persistence, URL state, localStorage, or backend user preference.

## Recommended implementation PR-stack

1. `uiux/explorer-project-breadcrumb-navigation-v1`
   - Frontend-only for normal navigation: store current `page.breadcrumbs` when opening a project and pass them to `ProjectPane`.
   - Add tests for folder -> project -> back path.
   - If direct project URL must show canonical path, add backend breadcrumb context first or in this PR.

2. `uiux/explorer-section-folder-type-labels-v1`
   - Frontend-only if `Раздел` is display alias for top-level folder.
   - Rename root create copy from "Папка" to "Раздел"; nested create copy remains "Папка".
   - Keep storage/API type as `folder`.

3. `feature/explorer-folder-move-dialog-v1`
   - Use existing `apiMoveFolder` + backend `POST /api/folders/{folder_id}/move`.
   - Add tree picker and enforce target restrictions in UI while relying on backend cycle validation.
   - Folder-only PR; do not imply project/session move.

4. `backend/explorer-project-session-move-api-v1`
   - Needed before project/session move UI.
   - Add project reparent endpoint with folder validation, uniqueness/caches/audit.
   - Add session move endpoint only if product confirms session can move between projects.

5. `feature/explorer-responsible-owner-fields-v1`
   - Likely backend/schema/API + UI.
   - Add responsible fields for section/folder/project as approved.
   - Wire org member picker from `/api/orgs/{org_id}/members` or an adjusted directory endpoint with correct permissions.

6. `audit/explorer-status-model-v1`
   - Do before implementation if product status semantics remain unclear.
   - Decide manual vs derived statuses per entity and source of truth.

7. `feature/explorer-smart-search-v1`
   - Start frontend-only for current loaded payload if acceptable.
   - Use backend endpoint/index for whole workspace/all accessible objects.

8. `uiux/explorer-sortable-columns-v1`
   - Frontend-only for visible rows by name/type/status/owner/updated.
   - Add persistence only after product chooses scope.

## Exact files likely to change

Frontend-only navigation/labels/search/sort:

- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/features/explorer/useWorkspaceExplorerController.js`
- `frontend/src/features/explorer/explorerApi.js`
- `frontend/src/features/explorer/work3TreeState.js`
- `frontend/src/features/explorer/workspaceRestore.js`
- `frontend/src/features/explorer/*.test.mjs`

Backend/API if needed:

- `backend/app/routers/explorer.py`
- `backend/app/storage.py`
- `backend/app/models.py`
- `backend/tests/*explorer*` or new Explorer router/storage tests

User directory / permissions if responsible picker is implemented:

- `frontend/src/lib/apiModules/orgApi.js`
- `backend/app/routers/org_members.py`
- `backend/app/services/org_workspace.py`

## Backend/schema risk map

| Requirement | Frontend-only? | Backend/schema risk |
| --- | --- | --- |
| Project breadcrumb after normal in-app navigation | Yes | Low; use existing folder `page.breadcrumbs`. |
| Project breadcrumb after direct project URL | Partly | Medium; project API lacks breadcrumb context. |
| Top-level folder displayed as `Раздел` | Yes | Low if alias only. |
| Durable `section` type | No | High; schema/API/migration/product semantics. |
| Move folder | UI-only on top of existing API | Low/medium; backend already validates cycles. |
| Move project | No | Medium/high; need API/storage validation and cache invalidation. |
| Move session | No | Medium/high; need product rule and API/storage validation. |
| Responsible for section/folder | No | High; missing schema/API. |
| Responsible for project | Not safely | Medium; project owner exists but assignment/update semantics are not clean. |
| Status for folders/sections | No | High; missing schema/source of truth. |
| Search current loaded rows | Yes | Low; limited scope. |
| Search whole workspace/all org objects | No | Medium/high; backend/index/pagination needed. |
| Sort current loaded rows | Yes | Low; limited scope. |
| Sort by responsible/status for folders | No | Blocked by missing fields. |

## Runtime validation plan for future implementation

For future PRs, validate on local or stage with non-mutating actions first:

1. Open Workspace Explorer root.
2. Confirm top-level items are labeled as sections if alias PR is implemented.
3. Open a section/folder and verify breadcrumb path.
4. Open a project from a folder and verify the same breadcrumb/back path is visible at top.
5. Use back navigation from project to return to the previous folder without losing loaded Explorer state.
6. Open direct project route and verify expected breadcrumb behavior according to product decision.
7. For move PR: open move dialog, verify invalid targets are disabled, cancel without mutation, then test on disposable entities only.
8. For responsible PR: verify picker list, assignment permissions, persisted reload, and audit/event behavior.
9. For status PR: verify source of truth after reload and search/sort compatibility.
10. For search/sort PRs: test current folder, nested/loaded children, project sessions, empty states, and large workspace behavior.

## Audit-only validation

Product code was not changed. This contour should validate with:

- `git diff --check`
- `git diff --cached --check`
- `git status -sb`
