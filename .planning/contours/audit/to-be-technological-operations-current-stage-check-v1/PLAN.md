# audit/to-be-technological-operations-current-stage-check-v1

## GSD Discipline

- **GSD availability result**: AVAILABLE
- **Commands executed**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `gsd state` → `model_profile=balanced`, `config_exists=false`, `roadmap_exists=false`
  - `find /root/.codex/skills -maxdepth 1 -type d -name 'gsd-*'` → 50+ skills present
- **Mode used**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Confirmation**: implementation не выполнялся
- **Confirmation**: product files не менялись
- **Confirmation**: contour bounded (`audit/to-be-technological-operations-current-stage-check-v1`)
- **Confirmation**: Agent 2 / Agent 3 gates prepared (single-lane mode)

## Source / Runtime Truth

- **Working directory**: `/opt/processmap-test`
- **Timestamp**: `2026-05-20T18:41:22+00:00`
- **Git branch**: `fix/lockfile-sync-test`
- **HEAD**: `5b20bc2d1292f419647238eaf37dac55f9315942`
- **origin/main**: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- **Git status**: 23 modified frontend/backend files from previous contours; no changes for this audit.
- **Frontend runtime**: `http://clearvestnic.ru:5180` assumed available (not required for this audit)
- **API runtime**: `http://clearvestnic.ru:8088` assumed available (not required for this audit)

## Canonical TO-BE References

1. **`docs/enterprise_target_model_to_be.md`** — Enterprise Target Model (TO-BE, MVP)
   - Org/Workspace/Project/Session hierarchy
   - Multi-tenant strategy (row-level tenancy, path-based scoping)
   - Org-level RBAC (owner/admin/member/viewer + service roles)
   - AuditLog entity
   - Source of truth rules

2. **`docs/enterprise_impl_factpack.md`** — AS-IS implementation facts + TO-BE integration points
   - AS-IS line ranges in `backend/app/storage.py`, `auth.py`, `main.py`
   - TO-BE insertion points with file/function/line references
   - Dual-routing map (new org-scoped + legacy endpoints)
   - Error contract convergence plan
   - Migration/backfill strategy

## Problem Statement

The Enterprise Target Model (TO-BE) was defined but never systematically checked against actual codebase state. After months of feature work (analytics hub, product actions registry, diagram performance, RAG layer), we need a cold audit to answer:

1. Which TO-BE schema changes are already implemented?
2. Which auth/org endpoints exist vs. what the factpack prescribes?
3. Is the dual-routing strategy partially implemented?
4. What is the exact gap between AS-IS and TO-BE?
5. What is the recommended priority order for closing gaps?

## Audit Scope (Bounded)

### In Scope
- Schema audit: `orgs`, `memberships`, `invites`, `audit_logs` tables; tenancy columns in `projects/sessions`
- Storage scoping audit: `org_id` context var, `_org_clause`, org-filter in CRUD
- Auth audit: org claims in tokens, membership resolution, login/refresh flow
- API endpoints audit: org-scoped routes (`/api/orgs/{org_id}/...`) vs. legacy routes
- Frontend audit: org switcher, `AuthProvider` org state, API propagation
- Error contract audit: HTTP status normalization progress
- Migration/backfill audit: legacy `owner_user_id` → `org_id` backfill status

### Out of Scope
- No product code changes
- No new endpoints or schema migrations
- No frontend UI modifications
- No runtime performance testing
- No diagram or analytics hub features

## Execution Mode

**TOKEN_ECONOMY_SINGLE_EXECUTOR** — This is a source-review and documentation audit. The work is sequential and does not justify parallel executor cost.

## Acceptance Criteria

1. `CURRENT_STAGE_CHECKLIST.md` exists with per-category DONE/PARTIAL/MISSING/UNKNOWN ratings.
2. `GAP_ANALYSIS_REPORT.md` exists mapping each TO-BE item to current code evidence (file:line or "not found").
3. `NEXT_CONTOUR_RECOMMENDATION.md` exists with prioritized gap list and suggested contour IDs.
4. No product code was modified.
5. All evidence references include exact file paths and line numbers where applicable.
6. Reviewer validates that checklist ratings match source evidence.

## Deliverables

| # | File | Owner | Purpose |
|---|------|-------|---------|
| 1 | `CURRENT_STAGE_CHECKLIST.md` | Agent 2 | Per-category implementation status |
| 2 | `GAP_ANALYSIS_REPORT.md` | Agent 2 | Detailed file:line evidence for each TO-BE item |
| 3 | `NEXT_CONTOUR_RECOMMENDATION.md` | Agent 2 | Prioritized recommendations |
| 4 | `EXEC_REPORT.md` | Agent 2 | Summary handoff |
| 5 | `REVIEW_REPORT.md` | Agent 4 | Validation of ratings and evidence |
