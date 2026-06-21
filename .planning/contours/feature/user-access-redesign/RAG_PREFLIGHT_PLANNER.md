# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: user-access-redesign
- **area/query**: users access permissions roles organizations / user access redesign UX permissions roles organizations
- **generated_at**: 2026-06-21T17:23:59.541Z

## Structured Facts

### Runtime Facts
- **project_atlas_local_path**: /Users/mac/Documents/Obsidian/ProjectAtlas (local, medium)

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- Version/update row should increment visibly. (Save, deploy, and version contours)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — Product/UI problem map
- **score**: 32.481
- **path**: `/opt/processmap-test/docs/audit_admin_users_membership_storage_profile_fields_v1.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match
- **snippet**:
```
1. Naming/section hierarchy - `Организации` is overloaded: *organizations*, **user*s*, memberships, invites and Git mirror live in one section. - Better label for the current combined surface: `Доступ и организации`. - Better future split: separate `Пользователи и доступ`, `Организации`, `Инвайты`, `Git mirror`. 2. *User* identity - Admin **user*s* table uses email as primary identity and raw technical ID as secondary. - There is no human display name or job title in the *user* payload. 3. Membership semantics - Membership is represented as org chips/*roles*, but there is no person profile context. - Org memb
```

### #2 — UI map
- **score**: 32.480
- **path**: `/opt/processmap-test/docs/audit_admin_users_membership_storage_profile_fields_v1.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match
- **snippet**:
```
Admin section composition today: - Nav label: `Организации`. - Page content includes: - create organization, - active organization rename, - **user*s* and membership, - invites, - Git mirror, - *organizations* table. Admin **user*s* table today: - Shows email as primary identity. - Shows raw `*user*_id` under email. - Shows platform role, memberships/org *roles*, status, created, actions. - Does not show name or job title because API payload does not provide them. Invite UI: - Invite creation captures full name and job title. - Invite table shows full name and job title. - Invite activation preview shows em
```

### #3 — API map
- **score**: 27.191
- **path**: `/opt/processmap-test/docs/audit_admin_users_membership_storage_profile_fields_v1.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match
- **snippet**:
```
Admin **user*s*: - `GET /api/admin/**user*s*` serializes **user*s* from `list_auth_**user*s*()`. - `POST /api/admin/**user*s*` accepts `email`, `password`, `is_admin`, `is_active`, `memberships`. - `PATCH /api/admin/**user*s*/{*user*_id}` accepts the same operational fields. - *User* payload includes `id`, `email`, `is_active`, `is_admin`, `created_at`, `memberships`. - *User* payload does not include `full_name` or `job_title`. Org members: - `GET /api/orgs/{org_id}/members` lists `org_memberships`. - It joins *user* email by looking up the file-backed auth identity by `*user*_id`. - It does not return name/title. Invites: - 
```

### #4 — storage.py
- **score**: 25.264
- **path**: `/opt/processmap-test/backend/app/storage.py`
- **source/category**: backend-src / code
- **why_matched**: recent_14d
- **snippet**:
```
from __future__ import annotations import json import os import re import sqlite3 import threading import time import uuid import hashlib import secrets from contextvars import ContextVar from dataclasses import dataclass from datetime import datetime, timezone from pathlib import Path from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple from .db import get_db_runtime_config, redact_database_url from .models import Project, Session try: import psycopg from psycopg.errors import IntegrityError as PsycopgIntegrityError from psycopg_pool import ConnectionPool except Exception: p
```

### #5 — Bounded next implementation plan
- **score**: 24.694
- **path**: `/opt/processmap-test/docs/audit_admin_users_membership_storage_profile_fields_v1.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match
- **snippet**:
```
Recommended next contour: `storage/admin-**user*s*-postgres-profile-truth-v1` Scope: 1. Add explicit Postgres/SQLite-compatible `**user*s*` or `*user*_profiles` durable schema after approval. 2. Migrate/copy `_auth_**user*s*.json` **user*s* into DB-backed *user* truth. 3. Preserve password hashes and activation state. 4. Add first-class profile fields: `full_name`, `job_title`. 5. On invite creation/activation, persist profile fields to *user*/profile truth. 6. Return `full_name` and `job_title` from admin **user*s* and org members APIs. 7. Then do a small UI contour that shows human identity in admin **user*s*/org members
```

### #6 — def create_org_project_session(
- **score**: 24.254
- **path**: `/opt/processmap-test/backend/app/_legacy_main.py`
- **source/category**: backend-src / code
- **why_matched**: recent_14d
- **snippet**:
```
def create_org_project_session( org_id: str, project_id: str, inp: CreateSessionIn, request: Request, mode: str | None = Query(default="quick_skeleton"), ) -> Dict[str, Any]: oid = str(org_id or "").strip() role, scope, err = _enterprise_require_project_*access*(request, oid, project_id) if err is not None: return err if str(role or "").strip().lower() not in _ORG_EDITOR_*ROLES*: return _enterprise_error(403, "forbidden", "insufficient_*permissions*") raw_mode = mode mode = _norm_project_session_mode(mode) if raw_mode is not None and mode is None: return _enterprise_error(422, "validation_error", "i
```

### #7 — def _enterprise_manage_project_members_guard(
- **score**: 24.033
- **path**: `/opt/processmap-test/backend/app/_legacy_main.py`
- **source/category**: backend-src / code
- **why_matched**: recent_14d
- **snippet**:
```
def _enterprise_manage_project_members_guard( request: Request, org_id: str, project_id: str, ) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[JSONResponse]]: role, scope, err = _enterprise_require_project_*access*(request, org_id, project_id) if err is not None: return None, None, err if not _is_role_allowed(role, _ORG_PROJECT_MEMBER_MANAGE_*ROLES*): return None, None, _enterprise_error(403, "forbidden", "insufficient_*permissions*") return role, scope, None # DEPRECATED: moved to utils/authz.py
```

## Required Gates
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Bounded scope defined in PLAN.md
- [ ] Acceptance criteria defined
- [ ] User rejection facts reviewed
- [ ] No product code written by Agent 1
- [ ] No merge/deploy/PR without explicit approval

## Warnings
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "users access permissions roles organizations" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "users access permissions roles organizations" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "user-access-redesign" --area "users access permissions roles organizations" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
