# Audit: Platform Admin Org Membership And Assignment Visibility V1

## Runtime/source truth

- Contour: `audit/platform-admin-org-membership-and-assignment-visibility-v1`
- Worktree: `/private/tmp/processmap-platform-admin-audit-v1`
- Remote: `origin git@github.com:xiaomibelov/processmap_v1.git`
- Branch: `audit/platform-admin-org-membership-and-assignment-visibility-v1`
- HEAD: `972b45de355febf313d375cf3b49f5ba97dfa29a`
- origin/main: `972b45de355febf313d375cf3b49f5ba97dfa29a`
- Merge base: `972b45de355febf313d375cf3b49f5ba97dfa29a`
- Starting status: clean audit worktree.
- Main checkout was dirty/conflicted, so this audit used a separate clean worktree.

## GSD proof

- `gsd`: unavailable.
- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`
- `gsd-sdk --version`: `gsd-sdk v0.1.0`
- `gsd-sdk query init.phase-op audit/platform-admin-org-membership-and-assignment-visibility-v1`: completed.
- Limitation: `.planning` and GSD agents were not installed in this worktree (`agents_installed: false`), so the contour continued by GSD discipline.

## Known symptoms

### Symptom A: self assignment fails

Surface:

- Workspace Explorer -> Section/Folder -> Assign responsible -> choose current user -> save.

Observed error:

- `Assigned user is not an org member`

Source-level flow:

1. Frontend opens assignee dialog and loads users with `apiListOrgMembers(activeOrgId)` in `frontend/src/features/explorer/WorkspaceExplorer.jsx:1660-1693`.
2. Saving a section/folder responsible sends `apiUpdateFolder(workspaceId, item.id, { responsible_user_id: normalizedUserId })` in `frontend/src/features/explorer/WorkspaceExplorer.jsx:1718-1727`.
3. `apiUpdateFolder` sends `PATCH /api/folders/{folder_id}?workspace_id={workspaceId}` in `frontend/src/features/explorer/explorerApi.js:51-55`.
4. Backend folder patch detects `responsible_user_id` and calls `validate_org_user_assignable(oid, payload.get("responsible_user_id"))` in `backend/app/routers/explorer.py:711-725`.
5. `validate_org_user_assignable` confirms the user exists, then calls `user_has_org_membership(uid, oid, is_admin=False)` in `backend/app/services/org_workspace.py:109-120`.
6. Passing `is_admin=False` means platform-admin virtual access is intentionally ignored, so a platform admin without a physical row in `org_memberships` fails with `assigned user is not an org member`.

### Symptom B: admin users table disappears / is not primary

Surface:

- `/admin/orgs`

Source-level flow:

1. Admin route data is loaded with `useAdminOrgsData({ enabled: route.section === "orgs" })` in `frontend/src/features/admin/AdminApp.jsx:102-104`.
2. `AdminOrgsPage` renders `AdminUsersPanel` first, above invites and org details, in `frontend/src/features/admin/pages/AdminOrgsPage.jsx:369-375`.
3. `AdminUsersPanel` returns `null` unless `isAdmin` is true in `frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx:104-140`.
4. If rendered, it calls `apiAdminListUsers()` -> `GET /api/admin/users` in `frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx:104-116` and `frontend/src/lib/apiModules/adminApi.js:26-28`.
5. Backend `/api/admin/users` uses `_platform_admin_context`, which requires `is_admin=True`, then returns all auth users from `list_auth_users()` in `backend/app/routers/admin.py:748-759`.
6. Therefore, a true platform admin should see the users table and all auth users. An org admin with memberships in multiple orgs can access the admin console, but the users table is intentionally hidden because `isAdmin=false`.

## Source map

| Area | File/function | Current behavior | Risk |
| --- | --- | --- | --- |
| Auth user model | `backend/app/storage.py:743-758`, `backend/app/auth.py:299-323` | `users.is_admin` is the platform-admin flag. | Product wording can confuse platform admin with org admin. |
| Platform admin virtual org access | `backend/app/storage.py:3377-3460` | `list_user_org_memberships(..., is_admin=True)` appends every org as role `platform_admin` without inserting `org_memberships` rows. | Access checks can pass while strict membership validators fail. |
| Org memberships | `backend/app/storage.py:1000-1006`, `4163-4188` | Physical org membership rows live in `org_memberships(org_id,user_id,role)`. `list_org_memberships(org_id)` returns only physical rows. | Member pickers fed by this endpoint exclude platform admins without physical membership. |
| Request org scope | `backend/app/startup/middleware.py:121-137` | Middleware resolves active org and stores `request.state.org_memberships = list_user_org_memberships(user_id, is_admin=is_admin)`. | Platform admin request state has virtual all-org rows, but member endpoints still return physical rows. |
| Org member list endpoint | `backend/app/services/org_workspace.py:198-219`, `backend/app/routers/org_members.py:12-14` | `GET /api/orgs/{org_id}/members` authorizes platform admin, then returns `list_org_memberships(oid)` only. | Picker excludes platform admin if no physical membership row exists. |
| Responsible validation | `backend/app/services/org_workspace.py:109-120`; used by `backend/app/routers/explorer.py:658`, `724` | Validates assigned user by `user_has_org_membership(uid, oid, is_admin=False)`. | Rejects platform admin self-assignment without physical membership. |
| Executor validation | `backend/app/services/org_workspace.py:109-120`; used by `backend/app/routers/explorer.py:849` and `backend/app/_legacy_main.py:8790`, `8858` | Same validator for project executor. | Same platform-admin rejection risk for executor assignment. |
| Explorer picker source | `frontend/src/features/explorer/WorkspaceExplorer.jsx:1660-1693`, `frontend/src/lib/apiModules/orgApi.js:165-172` | Picker loads org members only from `GET /api/orgs/{org_id}/members`. | Even if validator is fixed, picker may not show platform admin unless member endpoint or frontend merge explicitly includes them. |
| Explorer current-user merge helper | `frontend/src/features/explorer/explorerAssigneeModel.js:103-129` | Can merge current user only when current user's orgs/active org imply org belonging. | Source shows helper exists, but `WorkspaceExplorer.jsx` currently sets normalized API members directly, so the picker source remains org-members-only. |
| Admin orgs endpoint | `backend/app/routers/admin.py:725-745` | Uses `_admin_context`, then returns aggregate org items from `request.state.org_memberships`. Platform admin gets virtual all-org rows. | `/api/admin/orgs` itself should not be empty for platform admin; ambiguity remains for org-admin users. |
| Admin users endpoint | `backend/app/routers/admin.py:748-759` | Platform-admin-only; returns all auth users. | Org admins cannot use this endpoint/table by design. |
| Admin users table source | `frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx:104-140`, `360-455` | Table renders only if `isAdmin`; otherwise returns null. | If a user only has org-admin membership across multiple orgs, users table disappears. |

## Platform admin model

- Platform admin is stored on the auth user row as `users.is_admin` (`backend/app/storage.py:743-758`).
- `create_user(..., is_admin=True)` writes that flag (`backend/app/auth.py:299-323`).
- Platform admin is not necessarily a physical `org_memberships` row in every org.
- For access, `list_user_org_memberships(user_id, is_admin=True)` appends synthetic rows for every org with role `platform_admin` (`backend/app/storage.py:3435-3459`).
- `user_has_org_membership(user_id, org_id, is_admin=True)` checks the synthetic list, so platform admin passes route/access membership checks (`backend/app/storage.py:3463-3469`).
- Physical org membership remains separate: `org_memberships` table has primary key `(org_id, user_id)` (`backend/app/storage.py:1000-1006`).

Conclusion: platform admin has virtual org access, not automatic physical org membership.

## Org membership model

- A user can have memberships in multiple orgs; `org_memberships` is keyed by `(org_id, user_id)`.
- Roles in current code include at least:
  - platform admin: `users.is_admin=True`, surfaced as virtual role `platform_admin`.
  - org owner/admin: `org_owner`, `org_admin`.
  - project/work roles: `project_manager`, `editor`, `viewer`, `org_viewer`, `auditor`.
- Admin user management explicitly allows platform admins to have no personal org memberships:
  - UI: when `isPlatformAdmin`, `nextMemberships = []` and copy says organization memberships are not required (`frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx:148-166`, `348`).
  - Backend: `_normalize_admin_memberships(..., allow_empty=bool(body.is_admin))` allows empty memberships for platform admins (`backend/app/routers/admin.py:229-249`, `762-778`).

## Responsible/executor assignment validation

Single validator:

- `backend/app/services/org_workspace.py:109-120`

Behavior:

- Empty user id clears assignment.
- Non-empty user id must resolve via `build_assignable_user_payload`.
- Then the assigned user must satisfy `user_has_org_membership(uid, oid, is_admin=False)`.

Important detail:

- The assigned user's `is_admin` value is not loaded or considered.
- The validator deliberately passes `is_admin=False`, so platform-admin virtual access is ignored even when the assigned user is a platform admin.

Used by:

- Folder/section responsible on create: `backend/app/routers/explorer.py:648-667`.
- Folder/section responsible on patch: `backend/app/routers/explorer.py:699-735`.
- Project executor on create: `backend/app/routers/explorer.py:849`.
- Legacy project executor create/patch: `backend/app/_legacy_main.py:8790`, `8858`.

## Picker source

Frontend:

- `WorkspaceExplorer.jsx` calls `apiListOrgMembers(oid)` when assignee dialog opens (`frontend/src/features/explorer/WorkspaceExplorer.jsx:1660-1693`).
- It saves responsible through `apiUpdateFolder(..., { responsible_user_id })` and executor through `apiPatchProject(..., { executor_user_id })` (`frontend/src/features/explorer/WorkspaceExplorer.jsx:1718-1737`).
- `apiListOrgMembers` calls `GET /api/orgs/{org_id}/members` (`frontend/src/lib/apiModules/orgApi.js:165-172`, `frontend/src/lib/apiRoutes.js:29-33`).

Backend:

- `list_org_members_payload` returns only `list_org_memberships(oid)`, which is physical org membership rows (`backend/app/services/org_workspace.py:198-219`).

Conclusion: the picker is org-member-source-backed and excludes platform admins who only have virtual platform access.

## Admin users table source

Frontend:

- `/admin/orgs` renders `AdminUsersPanel` before org details (`frontend/src/features/admin/pages/AdminOrgsPage.jsx:369-388`).
- `AdminUsersPanel` returns null unless the current user prop `isAdmin` is true (`frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx:104-140`).
- If shown, the table is full-width and renders all returned users (`frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx:360-455`).

Backend:

- `GET /api/admin/users` requires `_platform_admin_context`, which means `users.is_admin=True` (`backend/app/routers/admin.py:200-207`, `748-759`).
- It returns `list_auth_users()`, not active-org members (`backend/app/storage.py:1898-1910`).

Conclusion: for true platform admins, the users table should not be filtered by active org membership. For org admins across one or more orgs, the table is intentionally hidden because it is platform-admin-only.

## Verdicts

| Verdict | Evidence | Implication | Recommended fix contour |
| --- | --- | --- | --- |
| `PLATFORM_ADMIN_NOT_ORG_MEMBER` | Platform admin virtual rows are appended by `list_user_org_memberships(..., is_admin=True)`; physical members come from `org_memberships` only (`backend/app/storage.py:3377-3460`, `4163-4188`). | Platform admin can administer orgs without physical membership. | Document as product invariant; do not auto-create memberships unless explicitly chosen. |
| `PLATFORM_ADMIN_SHOULD_BE_ASSIGNABLE_PRODUCT_DECISION` | Current admin UI says platform admin has all-org access and no personal memberships required (`AdminUsersPanel.jsx:148-166`, `348`). | Assignability is not implemented but likely product-consistent. | `fix/explorer-platform-admin-self-assignment-v1`. |
| `RESPONSIBLE_VALIDATOR_REQUIRES_ORG_MEMBERSHIP` | `validate_org_user_assignable` calls `user_has_org_membership(uid, oid, is_admin=False)` (`org_workspace.py:109-120`). | Responsible assignment requires physical membership. | Update assignable validator policy. |
| `RESPONSIBLE_VALIDATOR_IGNORES_PLATFORM_ADMIN` | Validator never checks assigned user's `is_admin`; it forces `is_admin=False`. | Platform admin self-assignment fails with "assigned user is not an org member". | Allow platform admins as assignable for orgs they can administer. |
| `PICKER_EXCLUDES_PLATFORM_ADMIN` | Picker loads `GET /api/orgs/{org_id}/members`; backend returns `list_org_memberships(oid)` physical rows only (`WorkspaceExplorer.jsx:1660-1693`, `org_workspace.py:198-219`). | Backend fix alone may still leave user invisible in picker. | Include platform admins/current platform admin in member-picker source or frontend merge. |
| `ADMIN_USERS_TABLE_FILTERED_BY_ORG_MEMBERSHIP` | Not true for platform admin users endpoint: `/api/admin/users` returns all `list_auth_users()`. But `/api/admin/orgs` aggregate items come from `request.state.org_memberships`. | Users table itself is not active-org-membership-filtered for platform admin; org aggregate is org-scope-driven. | No users-table backend filter fix for platform admin unless runtime proves API error. |
| `ADMIN_USERS_TABLE_API_EMPTY_FOR_PLATFORM_ADMIN` | Source says `/api/admin/users` returns all auth users for `is_admin=True` (`admin.py:748-759`). | Unlikely from backend empty list for true platform admin. | If runtime reports empty, audit auth/is_admin/request context first. |
| `ADMIN_USERS_TABLE_LAYOUT_ORDER_REGRESSION` | Source renders users section before invites and org details (`AdminOrgsPage.jsx:369-388`). | Current source does not show "moved below org details"; it is primary. | If UX still bad, address in UI-only contour with screenshot proof. |
| `ACTIVE_ORG_CONTEXT_MISMATCH` | Middleware resolves active org through virtual memberships for platform admin (`startup/middleware.py:129-137`, `storage.py:3472-3485`). | Platform admin active-org mismatch should be mitigated for route access; picker still depends on physical member list. | Fix picker/validator, not active-org resolution first. |
| `MULTI_ORG_ADMIN_CONTEXT_AMBIGUOUS` | `canAccessAdminConsole` allows org admins; `AdminUsersPanel` only renders for `isAdmin` (`adminUtils.js:102-108`, `AdminUsersPanel.jsx:139`). | "Admin access to multiple orgs" may mean org_admin memberships, not platform admin. Those users can access admin console but cannot see platform user management. | Split platform user management from org-scoped member management in UX/copy. |

## Root cause: self-assignment

Primary cause:

- Platform admin global/virtual org access is not accepted by the assignable-user validator. The validator requires physical org membership by calling `user_has_org_membership(uid, oid, is_admin=False)`.

Secondary cause:

- Picker source is physical org members only, so a platform admin without membership may be absent from the picker even before save.

## Root cause: users table visibility

For true platform admin:

- Source does not support "API returns empty because active org membership is missing"; `/api/admin/users` is platform-admin-only and returns all auth users.
- Source does not support "layout moved below orgs"; users section is first on `/admin/orgs`.

For org admin across multiple orgs:

- Source supports "table disappears" by design: admin console access can be granted by org roles, but `AdminUsersPanel` renders only for platform admins (`isAdmin=true`).

## Product decision matrix

| Decision | Option | Impact |
| --- | --- | --- |
| Can platform admin assign self as responsible? | Recommended: yes | Matches all-org administrative access; fixes reported self-assignment symptom. |
| Must platform admin be org member to be responsible? | Recommended: no | Avoids forced synthetic writes to `org_memberships`; assignment policy must explicitly accept platform admins. |
| Should platform admin appear in org member picker? | Recommended: yes, for orgs they can administer | Picker must match backend assignability or save will feel broken. |
| Should assigning platform admin create org membership? | Recommended: no | Avoids hidden data mutation and keeps platform access distinct from org membership. |
| Should `/admin/orgs` users table show all platform users or active-org users? | Recommended: all for platform admins; active-org member management should be a separate org-members surface | Current `/api/admin/users` already returns all users; active-org users belong in org member management. |
| Should org admin across multiple orgs see users from all orgs or selected active org? | Recommended: selected active org members, not platform all-users | Keeps org-admin permissions scoped; needs explicit UI copy/tabs to avoid ambiguity. |

Recommended product decision:

- Platform admin should be assignable and visible in picker for any org they can administer, without requiring manual org membership. This should be implemented explicitly and safely without `owner_user_id` fallback and without auto-creating org memberships.

## Recommended implementation stack

1. `fix/explorer-platform-admin-self-assignment-v1`
   - Backend: update `validate_org_user_assignable` or a new assignable-policy helper to allow assigned users with `users.is_admin=True`.
   - Scope: responsible and executor only.
   - Guardrails: no `owner_user_id` fallback; no membership auto-create; no inheritance.
   - Tests: platform admin without `org_memberships` can be responsible/executor; non-admin non-member still rejected; existing member assignment unchanged.

2. `backend/org-member-picker-platform-admin-inclusion-v1`
   - Backend: extend `GET /api/orgs/{org_id}/members` or add an assignable-users endpoint that includes platform admins/current platform admin as assignable rows.
   - Preferred: avoid overloading "members" semantics if product wants to keep members physical-only; create explicit assignable endpoint if feasible.
   - Tests: platform admin appears once; physical members still present; no duplicate if platform admin is also org member.

3. `fix/admin-users-table-platform-admin-visibility-v1`
   - Validate runtime for true platform admin.
   - If the symptom is actually org-admin users missing the table, fix copy/IA rather than backend: label platform user management as platform-admin-only and add an org-scoped members surface if needed.

4. Optional `uiux/admin-users-scope-toggle-v1`
   - Add explicit tabs/scopes:
     - all platform users (platform admin only);
     - active org members (org admins and platform admins).
   - This resolves "admin access to multiple orgs" ambiguity.

## Validation plan for implementation contours

Self-assignment:

- Create platform admin with no physical membership in target org.
- Confirm platform admin can open Explorer for that org.
- Confirm platform admin appears in responsible picker.
- Assign platform admin as responsible to section/folder.
- Verify payload uses `responsible_user_id=<platform_admin_id>`.
- Verify backend saves through `responsible_user_id`.
- Repeat for project executor.
- Confirm non-admin non-member still fails with org-member validation.
- Confirm no `org_memberships` row is created by assignment.

Admin users:

- Login as platform admin with no physical memberships.
- Open `/admin/orgs`.
- Confirm `GET /api/admin/orgs` returns org aggregate rows.
- Confirm `GET /api/admin/users` fires and returns all users.
- Confirm users table is visible above org details.
- Login as org_admin in multiple orgs but `is_admin=false`.
- Confirm admin console access is allowed.
- Confirm platform users table is hidden by current design.
- Decide whether to add active-org members view for org admins.

## Final conclusion

The two symptoms share the same conceptual ambiguity but not the exact same code path.

For Explorer assignment, the root cause is concrete: platform admin's all-org access is virtual, while `responsible_user_id` / `executor_user_id` validation requires physical `org_memberships` and ignores platform-admin status.

For `/admin/orgs`, true platform admins should already get an all-users table from `/api/admin/users`; active org membership is not the backend filter there. The likely visibility issue is either runtime/auth context proving `is_admin` is false, or product ambiguity where org admins across multiple orgs can access admin pages but do not get the platform-only users table.
