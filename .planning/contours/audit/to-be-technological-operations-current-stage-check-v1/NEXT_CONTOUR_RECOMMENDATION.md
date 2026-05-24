# Next Contour Recommendation — audit/to-be-technological-operations-current-stage-check-v1

**Run ID**: `20260520T184059Z-28875`  
**Auditor**: Agent 2 / Executor Part 1

---

## Prioritized Gap List

| Priority | Gap | Contour ID | Scope | Risk |
|----------|-----|------------|-------|------|
| P0 | `active_org_id` missing from JWT access/refresh tokens | `enterprise/auth-token-org-claims-v1` | Add `active_org_id` claim to `create_access_token`/`create_refresh_token`; update `issue_login_tokens` to resolve default org; ensure backward compatibility | High — blocks org-scoped API enforcement for stateless clients |
| P0 | `orgs` table missing `slug`, `status`, `updated_at` | `enterprise/schema-org-columns-v1` | ALTER `orgs` add columns; backfill `slug` from name; add index on `slug` | High — `status` needed for org lifecycle; `slug` needed for URL routing |
| P0 | `org_memberships` missing `id`, `status`, `invited_by`, `updated_at` | `enterprise/schema-membership-columns-v1` | Add `id` PK (migrate composite PK), `status`, `invited_by`, `updated_at`; update `ProjectStorage` membership reads | High — blocks invite lifecycle and RBAC granularity |
| P1 | `audit_logs` table missing | `enterprise/schema-audit-log-v1` | CREATE `audit_logs`; migrate `_audit_log_safe` writes to durable table; add decorator/middleware for auto-logging | Medium — compliance requirement; current writes may be ephemeral |
| P1 | `invites` table missing | `enterprise/schema-invites-v1` | CREATE `invites`; migrate existing invite endpoints to use dedicated table; add expiration logic | Medium — current invite storage location unconfirmed |
| P1 | Legacy endpoints return `{"error": ...}` with HTTP 200 | `enterprise/api-error-contract-convergence-v1` | Normalize all legacy endpoints to use `enterprise_error` helper; return proper 401/403/404/422 | Medium — confuses frontend error handling and monitoring |
| P2 | `sessions` table missing `workspace_id` | `enterprise/schema-sessions-workspace-v1` | ALTER `sessions` add `workspace_id`; update scoping in `Storage` CRUD | Low — workspace scoping currently incomplete for sessions |
| P2 | `_maybe_migrate_legacy_files` lacks `org_id` backfill | `enterprise/migration-owner-to-org-backfill-v1` | Map `owner_user_id` → derived `org_id` during migration; run one-time backfill script | Low — runtime default `'org_default'` masks the gap |
| P2 | Missing org-scoped session CRUD routes | `enterprise/api-org-session-routes-v1` | Implement `GET/PUT/PATCH/DELETE /api/orgs/{org_id}/sessions/{sid}`; wire to `_request_active_org_id` | Low — legacy routes provide fallback coverage |
| P2 | Missing org-scoped report routes | `enterprise/api-org-report-routes-v1` | Implement `GET/DELETE /api/orgs/{org_id}/reports/{rid}` | Low — legacy routes provide fallback coverage |
| P3 | `_audit_log_safe` not called for session/report/org ops | `enterprise/audit-coverage-expansion-v1` | Add `_audit_log_safe` calls to session create/update/delete, report ops, membership changes | Low — partial coverage exists for project ops |

---

## Recommended Execution Order

1. **Schema contours first** (`schema-org-columns-v1`, `schema-membership-columns-v1`) — all downstream auth and API work depends on these columns.
2. **Auth token claims** (`auth-token-org-claims-v1`) — must follow schema changes so `issue_login_tokens` can query `default_org_id` from the updated `org_memberships`.
3. **Audit & invites schema** (`schema-audit-log-v1`, `schema-invites-v1`) — can run in parallel after step 1.
4. **Error contract convergence** (`api-error-contract-convergence-v1`) — independent; safe to parallelize with schema work.
5. **Migration backfill** (`migration-owner-to-org-backfill-v1`) — run after schema is stable.
6. **Missing org-scoped routes** (`api-org-session-routes-v1`, `api-org-report-routes-v1`) — final API surface completion.
7. **Audit coverage expansion** (`audit-coverage-expansion-v1`) — last, after audit_logs table exists.

---

## Risk Assessment Summary

- **Highest risk**: JWT without org claim means middleware org resolution is the only enforcement layer; a compromised or misconfigured middleware path could bypass tenancy.
- **Compliance risk**: No durable `audit_logs` table means enterprise customers lack guaranteed write-audit trails.
- **Migration risk**: Backfill of `owner_user_id` → `org_id` is safe because current default `'org_default'` provides a fallback, but delaying it increases data-debt.
