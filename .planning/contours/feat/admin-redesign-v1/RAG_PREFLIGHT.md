# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: feat/admin-redesign-v1
- **area/query**: ProcessMap admin panel redesign / admin invites organizations git mirror system groups permissions matrix
- **generated_at**: 2026-06-30T15:22:01.927Z

## Structured Facts

### Runtime Facts
- **current_git_branch**: fix/lockfile-sync-test (test, high)

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
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
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — RAG Preflight
- **score**: 45.907
- **path**: `/opt/processmap-test/.planning/contours/feature/user-access-redesign/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: user-access-*redesign*] - command run: ```bash node tools/rag/pm-rag-agent-preflight.mjs \ --role planner \ --contour user-access-*redesign* \ --area "users access *permissions* roles *organizations*" \ --query "user access *redesign* UX *permissions* roles *organizations*" \ --top-k 5 --format md \ --out .planning/contours/feature/user-access-*redesign*/RAG_PREFLIGHT_PLANNER.md ``` - role: planner - query/area: users access *permissions* roles *organizations* - facts used: - `architecture/*processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1` (REVIEW_PASS) - `feature/*processmap*-agent-rag-source-regist…
```

### #2 — RAG Preflight
- **score**: 42.907
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/user-access-redesign/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
- command run: ```bash node tools/rag/pm-rag-agent-preflight.mjs \ --role planner \ --contour user-access-*redesign* \ --area "users access *permissions* roles *organizations*" \ --query "user access *redesign* UX *permissions* roles *organizations*" \ --top-k 5 --format md \ --out .planning/contours/feature/user-access-*redesign*/RAG_PREFLIGHT_PLANNER.md ``` - role: planner - query/area: users access *permissions* roles *organizations* - facts used: - `architecture/*processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1` (REVIEW_PASS) - `feature/*processmap*-agent-rag-source-registry-and-index-policy-v1` (REVIEW_
```

### #3 — #1 — Product/UI problem map
- **score**: 41.569
- **path**: `/opt/processmap-test/.planning/contours/feature/user-access-redesign/RAG_PREFLIGHT_PLANNER.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: user-access-*redesign*] - **score**: 32.481 - **path**: `/opt/*processmap*-test/docs/audit_*admin*_users_membership_storage_profile_fields_v1.md` - **source/category**: docs-curated / docs - **why_matched**: path_match - **snippet**: ``` 1. Naming/section hierarchy - `Организации` is overloaded: **organizations**, **user*s*, memberships, *invites* and *Git* *mirror* live in one section. - Better label for the current combined surface: `Доступ и организации`. - Better future split: separate `Пользователи и доступ`, `Организации`, `Инвайты`, `*Git* *mirror*`. 2. *User* identity - *Admin* **user*s* table u…
```

### #4 — #2 — UI map
- **score**: 38.940
- **path**: `/opt/processmap-test/.planning/contours/feature/user-access-redesign/RAG_PREFLIGHT_PLANNER.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: user-access-*redesign*] - **score**: 32.480 - **path**: `/opt/*processmap*-test/docs/audit_*admin*_users_membership_storage_profile_fields_v1.md` - **source/category**: docs-curated / docs - **why_matched**: path_match - **snippet**: ``` *Admin* section composition today: - Nav label: `Организации`. - Page content includes: - create organization, - active organization rename, - **user*s* and membership, - *invites*, - *Git* *mirror*, - **organizations** table. *Admin* **user*s* table today: - Shows email as primary identity. - Shows raw `*user*_id` under email. - Shows platform role, memberships/org *…
```

### #5 — #1 — Product/UI problem map
- **score**: 38.569
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/user-access-redesign/RAG_PREFLIGHT_PLANNER.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
- **score**: 32.481 - **path**: `/opt/*processmap*-test/docs/audit_*admin*_users_membership_storage_profile_fields_v1.md` - **source/category**: docs-curated / docs - **why_matched**: path_match - **snippet**: ``` 1. Naming/section hierarchy - `Организации` is overloaded: **organizations**, **user*s*, memberships, *invites* and *Git* *mirror* live in one section. - Better label for the current combined surface: `Доступ и организации`. - Better future split: separate `Пользователи и доступ`, `Организации`, `Инвайты`, `*Git* *mirror*`. 2. *User* identity - *Admin* **user*s* table uses email as primary identity an
```

### #6 — Input
- **score**: 37.771
- **path**: `/opt/processmap-test/.planning/contours/feature/user-access-redesign/RAG_PREFLIGHT_PLANNER.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: user-access-*redesign*] - **role**: planner - **contour**: user-access-*redesign* - **area/query**: users access *permissions* roles *organizations* / user access *redesign* UX *permissions* roles *organizations* - **generated_at**: 2026-06-21T17:23:59.541Z
```

### #7 — API map
- **score**: 36.903
- **path**: `/opt/processmap-test/docs/audit_admin_users_membership_storage_profile_fields_v1.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match
- **snippet**:
```
*Admin* users: - `GET /api/*admin*/users` serializes users from `list_auth_users()`. - `POST /api/*admin*/users` accepts `email`, `password`, `is_*admin*`, `is_active`, `memberships`. - `PATCH /api/*admin*/users/{user_id}` accepts the same operational fields. - User payload includes `id`, `email`, `is_active`, `is_*admin*`, `created_at`, `memberships`. - User payload does not include `full_name` or `job_title`. Org members: - `GET /api/orgs/{org_id}/members` lists `org_memberships`. - It joins user email by looking up the file-backed auth identity by `user_id`. - It does not return name/title. *Invites*: - 
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
node tools/rag/pm-rag-search.mjs "ProcessMap admin panel redesign" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap admin panel redesign" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feat/admin-redesign-v1" --area "ProcessMap admin panel redesign" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
