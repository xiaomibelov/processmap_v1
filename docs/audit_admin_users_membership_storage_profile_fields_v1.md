# Audit: admin users, membership storage and profile fields v1

Contour: `audit/admin-users-membership-storage-and-profile-fields-v1`

Дата: 2026-04-26

## Runtime/source truth

- Worktree: `/Users/mac/PycharmProjects/processmap_canonical_main/.worktrees/admin_users_membership_storage_profile_fields_v1`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Branch: `audit/admin-users-membership-storage-and-profile-fields-v1`
- HEAD: `51f422ed157dcf6f144c1b611344995bb384db71`
- `origin/main`: `51f422ed157dcf6f144c1b611344995bb384db71`
- Merge-base: `51f422ed157dcf6f144c1b611344995bb384db71`
- Status at bootstrap: clean
- Active app version: `v1.0.15` in `frontend/src/config/appVersion.js`
- Stage URL: not used in this audit

Exact touched/read UI surface:

- Admin route/nav label `Организации`
- `AdminOrgsPage`
- `AdminUsersPanel`
- `AdminOrgInvitesPanel`
- `OrgSettingsModal` members/invites/git mirror tabs
- Invite activation identity preview

## Storage truth verdict

Current user/member truth is split.

1. Auth users are not Postgres-backed.
   - `backend/app/auth.py` defines `AuthStore`.
   - It reads/writes `PROCESS_STORAGE_DIR/_auth_users.json`.
   - User create/update/list APIs call this store through `create_user`, `update_user`, `list_users`.

2. Organization, membership, project membership and invites are DB-backed.
   - `backend/app/storage.py` creates `orgs`, `org_memberships`, `project_memberships`, `org_invites`.
   - DB runtime supports Postgres when `FPC_DB_BACKEND=postgres` or `DATABASE_URL` is Postgres; otherwise SQLite.

3. Profile fields exist only on invites.
   - `org_invites` has `full_name`, `job_title`, `team_name`, `subgroup_name`, `invite_comment`.
   - `users` has no DB table in the inspected storage schema.
   - `AuthStore` user rows include `id`, `email`, `password_hash`, `is_active`, `is_admin`, `created_at`, activation flags. No first-class `full_name` or `job_title`.

Risk verdict: for a product application, real auth users are currently file-backed JSON truth, while membership truth is DB-backed. This violates single durable Postgres truth for real users/accesses.

## DB/schema map

DB-backed tables relevant to this contour:

- `orgs`: `id`, `name`, timestamps/actor, Git mirror config and health fields.
- `org_memberships`: `org_id`, `user_id`, `role`, `created_at`.
- `project_memberships`: `org_id`, `project_id`, `user_id`, `role`, `created_at`, `updated_at`.
- `org_invites`: `email`, `role`, `full_name`, `job_title`, `team_name`, `subgroup_name`, invite token/status fields.

Not found:

- No `users` Postgres schema.
- No `user_profiles` schema.
- No durable user `full_name` / `job_title` schema outside `org_invites`.
- No membership-level display profile fields.

Important behavior:

- `accept_org_invite` inserts/upserts `org_memberships`.
- It does not copy invite `full_name` or `job_title` into a user/profile table.
- Enterprise bootstrap reads `_auth_users.json` to create default org memberships in single-default-org mode.

## API map

Admin users:

- `GET /api/admin/users` serializes users from `list_auth_users()`.
- `POST /api/admin/users` accepts `email`, `password`, `is_admin`, `is_active`, `memberships`.
- `PATCH /api/admin/users/{user_id}` accepts the same operational fields.
- User payload includes `id`, `email`, `is_active`, `is_admin`, `created_at`, `memberships`.
- User payload does not include `full_name` or `job_title`.

Org members:

- `GET /api/orgs/{org_id}/members` lists `org_memberships`.
- It joins user email by looking up the file-backed auth identity by `user_id`.
- It does not return name/title.

Invites:

- `POST /api/orgs/{org_id}/invites` accepts `email`, `full_name`, `job_title`, `role`, `ttl_days`, `regenerate`.
- Invite preview/activation returns `full_name` and `job_title`.
- Activation creates/activates the auth identity and accepts membership, but profile fields stay invite-local.

Git mirror:

- Git mirror config is stored on `orgs`.
- It is mixed into the admin organizations page and org settings modal UI, but this audit did not inspect or change Git mirror logic.

## UI map

Admin section composition today:

- Nav label: `Организации`.
- Page content includes:
  - create organization,
  - active organization rename,
  - users and membership,
  - invites,
  - Git mirror,
  - organizations table.

Admin users table today:

- Shows email as primary identity.
- Shows raw `user_id` under email.
- Shows platform role, memberships/org roles, status, created, actions.
- Does not show name or job title because API payload does not provide them.

Invite UI:

- Invite creation captures full name and job title.
- Invite table shows full name and job title.
- Invite activation preview shows email, name, job title and organization.

Loss point:

- Name/title are present during invite creation and activation preview.
- They are not persisted to user/profile truth after invite acceptance.
- Admin users and org members cannot show them because they are absent from user/member API payloads.

## JS/static seed/mock verdict

No frontend JS/static seed was found as the runtime truth for users or membership. The frontend calls backend APIs.

The critical non-Postgres truth is backend file storage:

- `backend/app/auth.py` stores real auth users in `_auth_users.json`.
- `backend/app/storage.py` also reads `_auth_users.json` during enterprise bootstrap to backfill memberships.

Frontend `localStorage` usage exists only for UI/draft preferences in the inspected paths, not for real users/memberships.

## Product/UI problem map

1. Naming/section hierarchy
   - `Организации` is overloaded: organizations, users, memberships, invites and Git mirror live in one section.
   - Better label for the current combined surface: `Доступ и организации`.
   - Better future split: separate `Пользователи и доступ`, `Организации`, `Инвайты`, `Git mirror`.

2. User identity
   - Admin users table uses email as primary identity and raw technical ID as secondary.
   - There is no human display name or job title in the user payload.

3. Membership semantics
   - Membership is represented as org chips/roles, but there is no person profile context.
   - Org members API can recover email from auth store but cannot recover name/title.

4. Invite/profile semantics
   - Invite flow already captures human identity fields.
   - Those fields are invite metadata, not durable user profile truth.

## Bounded next implementation plan

Recommended next contour: `storage/admin-users-postgres-profile-truth-v1`

Scope:

1. Add explicit Postgres/SQLite-compatible `users` or `user_profiles` durable schema after approval.
2. Migrate/copy `_auth_users.json` users into DB-backed user truth.
3. Preserve password hashes and activation state.
4. Add first-class profile fields: `full_name`, `job_title`.
5. On invite creation/activation, persist profile fields to user/profile truth.
6. Return `full_name` and `job_title` from admin users and org members APIs.
7. Then do a small UI contour that shows human identity in admin users/org members and hides long user IDs from primary view.

Explicitly out of scope for this audit branch:

- Backend/schema implementation.
- Auth rewrite.
- Git mirror logic changes.
- Admin visual redesign.
- Discussions author rendering.
- Production deploy.

## Review gate

Before merge of any implementation contour:

- Storage migration review.
- Auth/session compatibility review.
- Admin API contract tests.
- Invite activation regression tests.
- Manual admin UI check for users, memberships, invites and profile display.
