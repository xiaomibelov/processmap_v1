# Context Used — Reviewer

**Contour**: `audit/to-be-technological-operations-current-stage-check-v1`  
**Run ID**: `20260520T184059Z-28875`  
**Reviewer**: Agent 4

---

## RAG Preflight Summary

**Command**: `node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "audit/to-be-technological-operations-current-stage-check-v1" --query "review rules for this contour" --format md --top-k 5`

**Key rules applied**:
- Agent 3/4 must use GSD discipline; independent validation required.
- No product runtime code changes in RAG tooling contours.
- RAG is read-only suggestion layer; do not auto-mutate code.
- Diagram performance reviews must include real mouse drag test (not applicable to this audit contour).
- Reviewer must verify fresh runtime for UI/runtime work (not applicable; this is source-review-only).

**User rejection overrides checked**:
- No user rejections related to `audit/to-be-technological-operations-current-stage-check-v1`.
- Historical rejections for diagram performance contours noted as contextual warning only.

**Contour facts**:
- No prior enterprise/tenant/org contours in RAG registry.
- RAG recommends source-review-only approach for this audit.

---

## Obsidian Context Used

- No direct Obsidian notes matching "enterprise target model" or "to-be technological operations".
- Canonical TO-BE references are in-repo: `docs/enterprise_target_model_to_be.md` and `docs/enterprise_impl_factpack.md`.
- Obsidian mirror will receive final report via `pm-agent-mirror-report.sh`.

---

## GSD Context Used

- GSD wrapper available at `/opt/processmap-test/bin/gsd`.
- 50+ GSD skills present.
- No active project roadmap/state for ProcessMap; audit bounded by contour scope.
- Mode: `GSD_PROCESSMAP_WRAPPER_PLANNING`.

---

## Runtime / Source Truth Evidence

| Check | Result |
|-------|--------|
| `pwd` | `/opt/processmap-test` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git diff --name-only` | 23 pre-existing modified files from other contours; **0 new changes for this audit** |
| `git status -sb` | No staged changes for this contour |
| Frontend runtime | Not required per PLAN.md |
| API runtime | Not required per PLAN.md |

---

## Files Inspected During Review

1. `backend/app/storage.py` — schema (`:1029-1054`), context vars (`:31`), `_org_clause` (`:453-457`), `Storage.load` (`:2700-2710`), `ProjectStorage.list` (`:3560-3575`)
2. `backend/app/auth.py` — `create_access_token` (`:415-435`), `issue_login_tokens` (`:576-601`)
3. `backend/app/startup/middleware.py` — `auth_guard_middleware` (`:107-144`)
4. `backend/app/legacy/request_context.py` — `enterprise_error` (`:33-46`)
5. `backend/app/_legacy_main.py` — `_audit_log_safe` (`:7945-7960`), error returns (`:3740-3750`, `:3877-3900`, `:5198-5210`), `auth_me` (`:3460-3490`)
6. `backend/app/routers/org_listing.py` — GET/POST `/api/orgs` (`:30-40`)
7. `backend/app/routers/org_members.py` — GET `/api/orgs/{org_id}/members` (`:10-20`)
8. `backend/app/routers/org_invites.py` — invite routes (`:10-40`)
9. `frontend/src/features/auth/AuthProvider.jsx` — org state/hydrate/switch (`:20-91`)
10. `frontend/src/RootApp.jsx` — `OrgSelectScreen` (`:42-76`)
11. `frontend/src/lib/apiCore.js` — header propagation (`:274-296`)
12. `frontend/src/App.jsx` — `activeOrgId` effect (`:3185-3210`)
13. `frontend/src/components/TopBar.jsx` — org display (`:293-310`)
