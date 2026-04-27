# Audit: Version Create Availability And Versioning Model v1

Contour: `audit/version-create-availability-and-versioning-model-v1`

Epic: Versioning / Save Semantics

Date: 2026-04-27

## 1. Runtime / Source Truth

| Item | Value |
| --- | --- |
| Repo/worktree | `/Users/mac/PycharmProjects/processmap_version_create_availability_audit_v1` |
| Remote | `origin git@github.com:xiaomibelov/processmap_v1.git` |
| Branch | `audit/version-create-availability-and-versioning-model-v1` |
| HEAD | `9e18ef99253447803bfb40117a53ea280d46ed2c` |
| origin/main | `9e18ef99253447803bfb40117a53ea280d46ed2c` |
| merge-base | `9e18ef99253447803bfb40117a53ea280d46ed2c` |
| Initial status | clean, `## audit/version-create-availability-and-versioning-model-v1...origin/main` |
| Active app version | `v1.0.19` from `frontend/src/config/appVersion.js` |
| Runtime/stage repro | Not performed: environment lacks stage/auth/test data access. Source/test proof only. |

GSD tooling reality in this worktree:

| Tool | Result |
| --- | --- |
| `gsd` | not found in PATH |
| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
| `gsd-sdk query init.phase-op audit/version-create-availability-and-versioning-model-v1` | returned JSON with `planning_exists:false`, `roadmap_exists:false`, `phase_found:false`, `agents_installed:false` |

Because the user clarified that `gsd` is installed but the new branch does not find it, this audit treats the missing standalone `gsd` as an environment/PATH limitation and proceeds with `gsd-sdk` proof plus GSD discuss/plan discipline.

## 2. GSD Discuss Result

User problem:

- Version creation availability is unclear and inconsistent across users.
- HTML/DOC edits do not enable `Создать новую версию`.
- Another user may be able to create a version in the same project/session.

Known risk:

- Product may have a BPMN-only revision model while UI implies project/session-wide versioning.
- Dirty state may be frontend-local/user-local.
- Permissions may affect version creation.
- Versioning may not cover DOC/HTML/DoD/property/meta changes uniformly.

Non-goals:

- No product code changes in this audit.
- No backend/schema changes.
- No UI copy changes.
- No deploy.

Audit goal:

- Produce exact source-backed versioning model and root-cause verdict.

## 3. GSD Plan Result

1. Frontend surfaces: process header, shell controller, `ProcessStage`, API clients, session companion read models, report/DOC clients.
2. Backend endpoints: BPMN XML save/list/detail/restore, session patch/save, report version endpoints.
3. Storage truth: `sessions`, `bpmn_versions`, `session_state_versions`, report versions embedded in `sessions.interview_json`.
4. Dirty-state flows: BPMN XML draft hash, companion revision ledger, report/DOC dirty, session patch/CAS state.
5. Permission flows: frontend disabled gates and backend org role gates.
6. Runtime repro: source-first; no real data mutation without stage/test access.
7. Output artifact: this markdown audit only.
8. Stop conditions: any product code/schema/runtime data mutation required.

## 4. Exact Questions Answered

| Question | Answer |
| --- | --- |
| When is `Создать новую версию` active? | Only on BPMN tab, with a session, no tab switch/flush/manual save/save in progress, and `publishActionRequired === true`. Source: `useProcessStageShellController.js:26-60`, `:107-115`. |
| When is it disabled/hidden? | It renders for sessions but is disabled when `canCreateRevisionNow` is false. No-diff tooltip says no new changes since last version. Source: `ProcessStageHeader.jsx:106-142`. |
| Which dirty flags affect it? | Not generic session/DOC dirty. Availability uses companion `revisionHistory.draftState.isDraftAheadOfLatestRevision` and `latestRevisionNumber/hasLiveDraft`. Source: `useProcessStageShellController.js:33-42`. |
| Does user/role affect it? | Backend create/save requires edit workspace (`admin` or `editor`). Frontend button state primarily depends on local/live revision state; role can still cause backend 403. Source: `_can_edit_workspace` in `_legacy_main.py:310-323`, BPMN save gate `:6048-6053`. |
| Does session status affect it? | No direct draft/published status gate was found in the button logic. Status can be a diagram truth patch, but the create-version button gate is BPMN tab + revision diff + save busy state. |
| Does BPMN XML affect it? | Yes. Draft hash is computed from live BPMN XML and compared to latest ledger revision. Source: `revisionReadModel.js:52-88`. |
| Does BPMN properties/meta affect it? | Mixed. If saved as BPMN XML, it can create a BPMN snapshot. If saved as `bpmn_meta` through session patch/meta patch, it creates `session_state_versions`, not `bpmn_versions`. Source: `_DIAGRAM_TRUTH_PATCH_KEYS` `_legacy_main.py:738`, `storage.py:2428-2464`, tests `test_diagram_revision_parity.py`. |
| Does DOC/HTML affect it? | No evidence it affects the toolbar create-version gate. Report/DOC has separate report version endpoints and storage under `interview.report_versions`. |
| What is in `bpmn_versions`? | `bpmn_xml` plus version number, diagram state version, source action, import note, created_by. Source: `storage.py:735-744`, `:2554-2626`. |
| Is HTML/DOC versioned at all? | Report/DOC artifacts have their own report version model in `sessions.interview_json.report_versions`, not `bpmn_versions`. Source: `_create_path_report_version_core` `_legacy_main.py:4423-4497`. |
| Why can another user create a version? | Most likely because the frontend gate depends on the user's current companion/live draft/revision state. Another user can have a different loaded snapshot, local-first companion source, active org/role, or stale/base version state. Backend snapshots also track `created_by`, but do not make version creation owner-only. |
| Is there user-specific/browser-local dirty state? | Yes for active org/auth/debug/pilot adapters and local-first companion configuration. The actual create gate reads the current in-memory bridge snapshot, which can differ by browser/user. Source: `ProcessStage.jsx:840-858`, `sessionCompanionJazzUiBridge.js:79-131`. |
| Is there a save/version race? | The code explicitly cancels pending diagram autosave before create-revision. Source: `ProcessStage.jsx:1744-1764`. However, if save/autosave already made the live XML match latest revision, the gate becomes no-diff. |
| Does base version matter? | Backend uses `base_diagram_state_version`/`rev` CAS for diagram truth writes and can 409 on stale state. Source: `_legacy_main.py:752-759`, `:6074-6079`. |
| Is there hidden conflict? | Backend can reject stale diagram writes with `DIAGRAM_STATE_CONFLICT`; frontend has conflict messaging, but this audit did not perform runtime proof. |

## 5. Frontend Version UI Source Map

| Frontend file | Responsibility | Version-related logic | Risk / notes |
| --- | --- | --- | --- |
| `frontend/src/features/process/stage/controllers/useProcessStageShellController.js` | Toolbar state derivation | `publishActionRequired = draftAheadOfLatest || (latestRevisionNumber <= 0 && hasLiveDraft)`; `canCreateRevisionNow` requires this and BPMN tab/save idle. | Generic DOC/session dirty is not part of create-version availability. |
| `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx` | Renders create revision button | Button disabled by `!canCreateRevisionFromCurrentState`; title says "из текущего состояния сессии". | UI copy can imply session-wide version while implementation is BPMN/revision-ledger based. |
| `frontend/src/components/ProcessStage.jsx` | Manual save/create revision orchestration | `createRevision` uses `persistReason = publish_manual_save`, calls BPMN flush, then companion ledger update; success text says "Создана новая версия BPMN." | Explicit code-level semantics are BPMN-oriented, not DOC/HTML-wide. |
| `frontend/src/lib/api.js` | API client | `apiPutBpmnXml` PUTs `/api/sessions/{sid}/bpmn` with `source_action`; `apiGetBpmnVersions` calls `/bpmn/versions`; report versions use separate APIs. | Two version APIs exist: BPMN versions and report versions. |
| `frontend/src/lib/apiRoutes.js` | API routes | BPMN routes are `/api/sessions/{sid}/bpmn/versions`; report routes are `/api/orgs/{org}/sessions/{sid}/reports/versions` and `/paths/{path}/reports`. | Naming collision: users can hear "version" as one concept, but source has separate histories. |
| `frontend/src/features/process/session-companion/read/revisionReadModel.js` | Revision read model | Compares live BPMN XML hash to latest ledger revision hash; `isDraftAheadOfLatestRevision` drives availability. | HTML/DOC changes cannot affect this unless they alter BPMN XML. |
| `frontend/src/features/process/session-companion/read/sessionCompanionJazzUiBridge.js` | Local-first/legacy companion bridge | Picks effective companion, builds revision history from `revision_ledger_v1` plus live draft. | Different users/browsers can see different effective companion snapshots if local-first/Jazz state differs. |
| `frontend/src/components/process/interview/services/pathReport.js` and report UI | Report/DOC artifacts | Normalize report markdown and report versions separately. | Not wired into `Создать новую версию` button. |

## 6. Backend Version API Map

| Endpoint | Handler | Request | Response | Writes BPMN XML? | Writes `bpmn_versions`? | Increments diagram/session state? | Permission |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `PUT /api/sessions/{session_id}/bpmn` | `session_bpmn_save` | `xml`, optional `source_action`, `base_diagram_state_version`, `bpmn_meta` | `ok`, `version`, `diagram_state_version`, optional `bpmn_version_snapshot` | Yes | Only if previous XML != next XML | Yes via `_mark_diagram_truth_write` | `_can_edit_workspace` admin/editor |
| `GET /api/sessions/{session_id}/bpmn/versions` | `session_bpmn_versions_list` | `limit`, `include_xml` | list of BPMN versions | No | No | No | session access |
| `GET /api/sessions/{session_id}/bpmn/versions/{version_id}` | `session_bpmn_version_detail` | version id | one row with `bpmn_xml` | No | No | No | session access |
| `POST /api/sessions/{session_id}/bpmn/restore/{version_id}` | `session_bpmn_restore` | optional base version | restores selected version XML | Yes | If restored XML differs | Yes | `_can_edit_workspace` admin/editor |
| `PATCH /api/sessions/{session_id}` | `patch_session` | partial session fields | updated session | Only if payload includes BPMN-related persisted fields; not XML through this route | No direct `bpmn_versions`; non-XML diagram writes trace to `session_state_versions` | For `_DIAGRAM_TRUTH_PATCH_KEYS` yes | per-field edit gates |
| `PATCH /api/sessions/{session_id}/bpmn_meta` | `session_bpmn_meta_patch` | meta patch | updated meta | No | No | Yes as non-BPMN diagram truth | edit gate/CAS |
| `POST /api/sessions/{sid}/paths/{path_id}/reports` | `create_path_report_version` | report build payload | report version row | No | No | Saves session interview/report state | legacy/session scope |
| `POST /api/orgs/{org}/sessions/{sid}/reports/build` | `build_org_session_report` | path id, steps hash, payload | report version row | No | No | Saves session interview/report state | org editor/admin |
| `GET /api/orgs/{org}/sessions/{sid}/reports/versions` | `list_org_session_report_versions` | path id, optional steps hash | report versions | No | No | No | org read role |

## 7. DB / Storage Version Map

| Data type | Storage location | Current version field | Revision history? | Version action | Actor tracked? |
| --- | --- | --- | --- | --- | --- |
| BPMN XML | `sessions.bpmn_xml` | `sessions.bpmn_xml_version`, `sessions.diagram_state_version` | Yes, `bpmn_versions.bpmn_xml` | XML-changing save/import/restore/clear | `bpmn_versions.created_by`, diagram last write actor |
| BPMN meta / overlays / hybrid / drawio | `sessions.bpmn_meta_json` | `diagram_state_version` for diagram truth writes | Not in `bpmn_versions` unless included in XML-changing BPMN save; non-XML writes trace in `session_state_versions` | `PATCH /sessions`, `PATCH /bpmn_meta`, sometimes BPMN PUT with meta | `session_state_versions.actor_user_id` |
| Session interview / DOC/report data | `sessions.interview_json` | `sessions.version`, plus `diagram_state_version` if treated as diagram truth | Report versions embedded under `interview.report_versions` | report build endpoints or session patch | report row has created fields; session save has updated_by |
| Report/DOC markdown/JSON | `sessions.interview_json.report_versions[path_id][]` | per-row `version` | Yes, separate report history | report build/create path report version | request user logged in audit; row has timestamps |
| DoD | Derived from analytics/interview/report artifacts | no dedicated DoD version table found | No dedicated DoD history found | recompute/analytics/session patch | session update actor |
| Notes/discussions | `sessions.notes`, `notes_by_element_json`, plus `note_threads` table | no version field tied to create version | No evidence of `bpmn_versions` participation | note endpoints/session patch | note thread actors separately |
| Project/session metadata | `sessions.*`, `projects.*` | `version`, `updated_at` | No single session-wide version snapshot found | session patch/put | `updated_by`, audit logs |

## 8. Factual Versioning Semantic Model

FACTUAL MODEL:

- The toolbar button currently means: create/publish a BPMN-oriented revision from current live BPMN XML and companion revision ledger state.
- It does not mean: create a version of the whole session/project including DOC/HTML/report/DoD/discussions by default.
- `bpmn_versions` is a BPMN XML snapshot table. Its durable payload is `bpmn_xml` plus metadata (`source_action`, `diagram_state_version`, `created_by`).
- The backend helper `_create_bpmn_revision_snapshot_if_xml_changed` returns `None` when previous XML equals next XML. Therefore `publish_manual_save` with unchanged XML can succeed without creating a `bpmn_versions` row.
- DOC/HTML/report artifacts have a separate report version model under `interview.report_versions` and separate `/reports` APIs.
- Non-BPMN diagram state changes can increment `diagram_state_version` and create `session_state_versions`, but those are trace/parity rows, not user-facing BPMN versions.
- Different users can differ because availability is computed in frontend from the user's current in-memory/effective companion read model and live BPMN XML hash, while backend permission/CAS state can also differ by role/org/base version.

## 9. Dirty-State / Change-Detection Map

| Change source | Dirty flag / state | Save path | Version availability impact | Notes |
| --- | --- | --- | --- | --- |
| BPMN XML | live XML hash vs latest ledger revision hash | `apiPutBpmnXml` to `/bpmn` | Direct impact; enables create when draft is ahead | Primary gate. |
| Manual save busy | `isManualSaveBusy`, `saveSnapshot.isSaving` | toolbar/controller state | Disables create while busy | Race control. |
| DOC/HTML/report | report build/version state, interview data | report endpoints or `apiPatchSession` | No direct impact on create button | Separate report version history. |
| DoD | derived readiness/analytics/interview | recompute/session patch | No direct impact found | Product decision needed if DoD should be session-versioned. |
| BPMN meta/properties | `bpmn_meta`, `diagram_state_version` | `apiPatchBpmnMeta`, `apiPatchSession`, sometimes BPMN PUT | Indirect/mixed; XML-changing path can create BPMN version, meta-only path cannot | Tests prove meta-only creates `session_state_versions`, not `bpmn_versions`. |
| Discussions/notes | notes/note thread state | note APIs/session patch | No direct impact found | Separate collaboration data. |
| Base/latest state | `base_diagram_state_version`, frontend ref | all diagram truth writes | Can block save/version through 409 stale conflict | User-specific stale views possible. |

## 10. User / Permission Map

| Action | Frontend gate | Backend gate | Role/user dependent? | Risk |
| --- | --- | --- | --- | --- |
| Create BPMN version | BPMN tab + companion revision diff + save idle | `PUT /bpmn`, `_can_edit_workspace` | Yes: backend requires admin/editor; frontend also depends on user's loaded state | Another user may see enabled if their companion/live draft state differs. |
| Save BPMN | save idle/session/BPMN sync | `_can_edit_workspace`, CAS | Yes | 403/409 can prevent save. |
| Save session/DOC/interview | local dirty/session patch | per-field `_can_edit_workspace`; report org editor for report build | Yes | May save DOC/report while not enabling BPMN version. |
| List BPMN versions | API call | session access | Mostly access-dependent | Viewer may list but not create. |
| Report versions | report UI/API | org read/editor depending list/build | Yes | Separate from BPMN create-version button. |
| Restore BPMN version | UI/API | `_can_edit_workspace`, CAS | Yes | Creates new BPMN snapshot only if XML changes. |

## 11. Root-Cause Verdicts

### A. `BPMN_ONLY_VERSIONING_MODEL`

Evidence:

- `bpmn_versions` schema stores `bpmn_xml` as the snapshot payload (`storage.py:735-744`).
- `create_bpmn_version_snapshot` requires `bpmn_xml` and inserts only that snapshot payload (`storage.py:2554-2626`).
- `session_bpmn_save` creates a snapshot only through `_create_bpmn_revision_snapshot_if_xml_changed` (`_legacy_main.py:6011-6038`, `:6080-6092`).
- Backend tests assert unchanged `publish_manual_save` does not create a BPMN version and meta-only writes use `session_state_versions`.

User impact:

- Editing HTML/DOC/report data does not create or enable BPMN versions.

Recommended fix contour:

- `uiux/create-version-scope-and-disabled-reason-v1` if BPMN-only is intended.
- `feature/session-wide-version-snapshot-v1` if user expectation is session-wide.

### B. `UI_LABEL_OVERPROMISE`

Evidence:

- Button text is generic `Создать новую версию`.
- Tooltip says create from current session state (`ProcessStageHeader.jsx:110-114`).
- Orchestration success text says `Создана новая версия BPMN.` (`ProcessStage.jsx:1973`), revealing narrower implementation semantics.

User impact:

- Users reasonably expect DOC/HTML/DoD/session data to participate.

Recommended fix contour:

- `uiux/create-version-scope-and-disabled-reason-v1`.

### C. `DOC_HTML_VERSION_GAP`

Evidence:

- Report/DOC versions are created by report endpoints and stored in `interview.report_versions` (`_legacy_main.py:4423-4497`, `:8385-8448`).
- They are not part of `bpmn_versions`.
- Create-version availability has no DOC/report dirty input (`useProcessStageShellController.js:26-60`).

User impact:

- HTML/DOC changes may be persisted/versioned in a separate report history but do not enable the main create-version action.

Recommended fix contour:

- `audit/versioning-doc-html-storage-and-history-v1` for deeper DOC storage semantics.
- `feature/session-wide-version-snapshot-v1` if one version should cover BPMN + DOC + DoD + meta.

### D. `DIRTY_STATE_GAP`

Evidence:

- Create-version gate uses `draftAheadOfLatest`, `latestRevisionNumber`, and `hasLiveDraft`; not report/doc dirty (`useProcessStageShellController.js:33-42`).
- Report APIs and session patch APIs are separate from this gate.

User impact:

- DOC dirty can be real, but button remains disabled/no-diff.

Recommended fix contour:

- `fix/doc-html-dirty-state-version-gate-v1` only if product decides DOC dirty should enable this button.

### E. `USER_LOCAL_STATE_DIFFERENCE`

Evidence:

- Revision state is built from effective companion (`legacy` or `jazz`) and live draft in the browser (`sessionCompanionJazzUiBridge.js:79-131`).
- The diff flag compares live BPMN XML hash to latest revision hash (`revisionReadModel.js:62-88`).
- `ProcessStage` keeps per-session base diagram state in refs (`ProcessStage.jsx:477-510`).

User impact:

- User A and User B can see different button availability if they loaded different companion snapshots, have different local-first adapter state, active org/role, or stale base state.

Recommended fix contour:

- `fix/create-version-availability-server-truth-v1`.
- `fix/version-context-refresh-after-cross-user-save-v1`.

### F. `BASE_VERSION_STALE_OR_CONFLICT`

Evidence:

- Backend resolves `base_diagram_state_version` from payload/header and rejects stale writes with conflict (`_legacy_main.py:752-759`, `:850-859`, `:6074-6079`).
- Many frontend write paths propagate base diagram state.

User impact:

- A stale user can fail to save/create even when another user with fresh state can create.

Recommended fix contour:

- `fix/version-context-refresh-after-cross-user-save-v1`.

## 12. Product Decision Matrix

| Product question | Option | Impact |
| --- | --- | --- |
| What should `Создать новую версию` mean? | BPMN-only | Least backend change; must rename/explain button and disabled reason. |
| What should it mean? | Session-wide | Aligns with user expectation; requires new snapshot model for BPMN + DOC + DoD + meta. |
| Should DOC/HTML create versions? | Separate history only | Current direction; needs clearer UI and report version discoverability. |
| Should DOC/HTML create versions? | Included in session version | Requires new durable snapshot schema and migration/backfill decisions. |
| Should DoD/properties/robot meta be included? | Only if serialized into BPMN XML | Current mixed behavior; confusing. |
| Should DoD/properties/robot meta be included? | Always in session snapshot | More coherent product model; bigger implementation. |
| Should discussions/notes be included? | Usually no | They are collaboration artifacts; include only if product wants audit/release snapshots. |
| Should availability be local or server truth? | Server truth | Reduces cross-user inconsistency; requires endpoint returning can-create + reason. |

Recommended product model:

Use a **session-wide version snapshot** if the product promise is "version of the process/session". Snapshot should include BPMN XML, selected `bpmn_meta`, DOC/report references or payload, DoD/readiness summary, and relevant properties/robot metadata. Keep discussions/notes outside by default unless explicitly needed for release history.

Why:

- Current UI wording and user expectation are session-wide.
- Current implementation is BPMN-only plus separate report history, which explains the reported inconsistency.
- Server-side availability with explicit reasons would normalize behavior across users.

Migration/implementation impact:

- Requires new snapshot definition and likely new table or JSON payload versioning.
- Existing `bpmn_versions` can remain as BPMN-only technical history.
- UI should distinguish "BPMN version" from "Session version" during migration.

## 13. Recommended Next Contours

1. `uiux/create-version-scope-and-disabled-reason-v1`
   - Problem: button overpromises and disabled reason hides BPMN-only semantics.
   - Scope: rename/copy/tooltip/status only.
   - Non-goals: no versioning model change.
   - Likely files: `ProcessStageHeader.jsx`, revision history UI model, tests.
   - Validation: DOC edit shows clear reason that BPMN version is unchanged.

2. `fix/create-version-availability-server-truth-v1`
   - Problem: frontend-local companion state can differ by user.
   - Scope: backend endpoint returns `can_create`, `reason`, latest version/draft comparison; frontend consumes it.
   - Non-goals: no session-wide snapshot yet.
   - Likely files: backend session/BPMN API, frontend shell controller/API client.
   - Validation: User A/User B get same reason for same durable state and role.

3. `fix/version-context-refresh-after-cross-user-save-v1`
   - Problem: stale base/latest state can make one user unable to create while another can.
   - Scope: refresh latest diagram/revision context after remote save/presence/409.
   - Non-goals: no new schema.
   - Likely files: `ProcessStage.jsx`, conflict handling, session companion bridge.
   - Validation: cross-user save updates disabled reason and base version.

4. `audit/versioning-doc-html-storage-and-history-v1`
   - Problem: DOC/HTML/report versioning exists separately; exact user-facing semantics need product audit.
   - Scope: report storage, DOC HTML payloads, history UI.
   - Non-goals: no implementation.
   - Likely files: report endpoints, report drawer, interview utils.
   - Validation: source map for every DOC/HTML write/read/version action.

5. `feature/session-wide-version-snapshot-v1`
   - Problem: if product chooses session-wide versioning, current BPMN-only table is insufficient.
   - Scope: new snapshot schema/API/UI for BPMN + DOC + DoD + meta.
   - Non-goals: no discussion/notes inclusion unless separately decided.
   - Likely files: backend storage/API, frontend version UI, migration tests.
   - Validation: DOC-only edit enables session version and snapshot restore semantics are defined.

## 14. Evidence Highlights

- Button availability:
  - `frontend/src/features/process/stage/controllers/useProcessStageShellController.js:26-60`
  - `frontend/src/features/process/stage/controllers/useProcessStageShellController.js:107-115`
  - `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx:106-142`
- BPMN create version orchestration:
  - `frontend/src/components/ProcessStage.jsx:1744-1764`
  - `frontend/src/components/ProcessStage.jsx:1935-1974`
- BPMN API client/routes:
  - `frontend/src/lib/api.js:878-987`
  - `frontend/src/lib/apiRoutes.js:119-130`
- Report/DOC API client/routes:
  - `frontend/src/lib/api.js:641-720`
  - `frontend/src/lib/apiRoutes.js:61-69`, `:136-140`
- Backend BPMN version creation:
  - `backend/app/_legacy_main.py:6011-6038`
  - `backend/app/_legacy_main.py:6041-6092`
  - `backend/app/storage.py:735-744`
  - `backend/app/storage.py:2554-2626`
- Backend report versions:
  - `backend/app/_legacy_main.py:4423-4497`
  - `backend/app/_legacy_main.py:8385-8448`
- Non-BPMN diagram truth trace:
  - `backend/app/_legacy_main.py:738`
  - `backend/app/_legacy_main.py:862-883`
  - `backend/app/storage.py:2428-2464`
- Permissions:
  - `backend/app/_legacy_main.py:310-323`
  - `backend/app/_legacy_main.py:6048-6053`
  - `backend/app/_legacy_main.py:6311-6316`

## 15. Runtime Repro Limitation

Runtime proof not performed because environment lacks stage/auth/test data access.

No real user data was mutated. No backend/API/schema/frontend product code was changed.

## 16. Validation Plan For Future Runtime Repro

1. Same user changes BPMN XML: verify button enables, create produces `bpmn_version_snapshot`.
2. Same user changes DOC/HTML/report only: verify report save/version behavior, verify main create button stays disabled/no-diff.
3. Same user changes `bpmn_meta` only: verify `session_state_versions` grows and `bpmn_versions` does not.
4. User A vs User B: compare role, active org, companion source, `latestRevisionNumber`, `draftState`, `base_diagram_state_version`, button disabled title.
5. Refresh after cross-user save: verify latest context and disabled reason update.

## 17. Final Audit Verdict

The reported behavior is explainable from source:

- The main `Создать новую версию` action is currently BPMN-oriented.
- HTML/DOC/report changes are not part of `bpmn_versions` and do not feed the button's dirty/diff gate.
- Report/DOC has separate versioning under `interview.report_versions`.
- Another user can differ because create availability is computed from that user's frontend companion/live draft state plus backend role/base-version conditions.

This is not safe to "fix" until product decides whether "new version" means BPMN-only, session-wide, project-wide, or publish/release version.
