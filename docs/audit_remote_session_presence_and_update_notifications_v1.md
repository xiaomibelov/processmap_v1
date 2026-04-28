# Audit: Remote Session Presence and Update Notifications v1

## Runtime / Source Truth

- Contour: `audit/remote-session-presence-and-update-notifications-v1`
- Worktree: `/private/tmp/processmap-remote-session-notifications-audit-v1`
- Remote: `origin git@github.com:xiaomibelov/processmap_v1.git`
- Branch: `audit/remote-session-presence-and-update-notifications-v1`
- HEAD: `766488eaecfbdd89558a2080c6e7450bfb628e42`
- `origin/main`: `766488eaecfbdd89558a2080c6e7450bfb628e42`
- Merge-base: `766488eaecfbdd89558a2080c6e7450bfb628e42`
- Git status at bootstrap: clean
- App version before audit: `v1.0.49` in `frontend/src/config/appVersion.js`
- Route/surface audited:
  - Process page: `frontend/src/components/ProcessStage.jsx`
  - Process header: `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
  - Remote update inline block: `remoteSaveHighlightView` rendered in `ProcessStageHeader`
  - Toast surface: `ProcessSaveAckToast` and `showSaveAckToast`
  - Version polling: `apiGetBpmnVersions(sid, { limit: 1 })`
- Stage URL recorded but not exercised: `https://stage.processmap.ru/app?project=b12ff022e8&session=17533cfbfd`
- Runtime/stage manual proof: not performed; audit-only, no deploy/auth run.

## GSD Proof

- `gsd`: not installed (`zsh: command not found: gsd`)
- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`
- `gsd-sdk --version`: `gsd-sdk v0.1.0`
- `gsd-sdk query init.phase-op audit/remote-session-presence-and-update-notifications-v1`: completed.
- Limitation: `.planning` was not present in this clean worktree and GSD agents were reported missing, so this audit follows the supplied GSD gates manually.

## Source Map

| Area | File / function | Current behavior | Gap |
| --- | --- | --- | --- |
| `/bpmn/versions?limit=1` frontend caller | `frontend/src/components/ProcessStage.jsx:1396-1464` `pollRemoteSessionSnapshot` | Calls `apiGetBpmnVersions(sid, { limit: 1 })`; if newer than local/seen version, calls `apiGetSession(sid)` and builds remote highlight from full session. | The head response already has actor fields, but polling ignores them. The extra session fetch is already present for full refresh snapshot, not just display. |
| `/bpmn/versions?limit=1` API wrapper | `frontend/src/lib/api.js:904-942`, `frontend/src/lib/apiRoutes.js:124-127` | Builds `/api/sessions/{id}/bpmn/versions?limit=1`; returns `items/versions` raw plus normalized top-level counts/hash fields. | Top-level normalizer does not expose latest actor, but it does not drop per-item `author_*` fields because `items` are raw. |
| Backend route | `backend/app/_legacy_main.py:6259-6340` `session_bpmn_versions_list` | Returns latest rows with `author_id`, `author_name`, `author_email`, `author_display`, `author`, `created_by`, `diagram_state_version`, hash fields. | No presence/current-active-users data. |
| Polling interval and triggers | `frontend/src/components/ProcessStage.jsx:248-250`, `1481-1503` | Polls every `9000ms`; runs on mount; runs on `window.focus`; runs on `document.visibilitychange`; skips hidden documents; has in-flight guard. | Visibility handler calls poll on every visibilitychange, but hidden state is skipped inside poll. |
| Response fields used by frontend | `ProcessStage.jsx:1408-1424` | Uses only first item `diagram_state_version` from head response to decide if newer. | Ignores `items[0].author_display`, `created_by`, `source_action`, `created_at`, hashes. |
| Response fields available but unused | `_legacy_main.py:6293-6314`, `api.js:911-916` | Latest item includes actor display/id/email/name and source metadata. | Actor can be displayed without a new request if the implementation reads `headItems[0]`. |
| Remote update detection | `ProcessStage.jsx:1296-1377`, `1396-1464` | New remote update is detected by `head.diagram_state_version > max(seen, local)`, then full session is fetched and compared/applied. | Detection is version-based, not actor-based; actor display comes from full session last-write fields today. |
| Inline header block | `ProcessStageHeader.jsx:183-207` | Renders `diagram-toolbar-remote-save-highlight` badge and `diagram-toolbar-remote-save-refresh` button in toolbar. | Presentation belongs in toast/notification surface; state/action should remain in ProcessStage until moved. |
| Refresh session action | `ProcessStage.jsx:1223-1275`, `1505-1521` | Uses pending `serverSession` captured from `apiGetSession(sid)` and applies it via `onSessionSyncWithVersion`, then `bpmnSync.resetBackend()`. | Existing toast does not support actions; moving this button requires toast action support or a separate non-header action surface. |
| Existing toast surface | `ProcessStage.jsx:909-935`, `6173-6177`; `ProcessSaveAckToast.jsx:25-262` | One transient process toast, message + tone only, 4s auto-hide, anchored near `diagram-toolbar-notification-anchor`. | No action button, no explicit dedupe key, no persistent mode, no manual close. |
| Toast classifier | `processToastMessage.js:39-52` | Remote/user messages classify as `remote_user` and get label `Другой пользователь`. | Can format remote update message via current toast without new infra, but action is missing. |
| Actor/user display source | Backend `_build_bpmn_version_author` `_legacy_main.py:271-303`; version list `_legacy_main.py:6290-6314`; session last-write `_legacy_main.py:863-883` | Actor display is available on version-list items and session last-write fields. | Current frontend uses session last-write after extra `apiGetSession`; it does not use version-list actor fields. |
| Presence/current session users source | `sessionPresenceModel.js:1-145`, `ProcessStage.jsx:956-986`, `1317-1323`, `1441-1448` | Client-side actor list: current user heartbeat plus last remote write actor seen during polling; stale actors pruned by TTL. | This is not real "who is in session now". It is inferred recent activity, not server presence. |
| Telemetry/error notification interaction | `ProcessStage.jsx:942-952`, `999-1018` | `genErr/infoMsg` and save lifecycle states are bridged to toast with signature dedupe. | Remote update highlight is still separate header presentation and bypasses this toast path. |

## Existing `/bpmn/versions?limit=1` Polling Map

- Frontend caller: `ProcessStage.jsx:1396-1464`.
- Exact call: `const head = await apiGetBpmnVersions(sid, { limit: 1 });` at `ProcessStage.jsx:1404`.
- API route builder keeps the query shape in `apiRoutes.sessions.bpmnVersions`: `limit` and optional `include_xml`; no actor lookup.
- Frequency:
  - Constant `REMOTE_SESSION_SYNC_POLL_MS = 9000` at `ProcessStage.jsx:250`.
  - Interval at `ProcessStage.jsx:1488-1491`.
- Triggers:
  - Mount: `runPoll("mount")` at `ProcessStage.jsx:1488`.
  - Interval: `runPoll("interval")`.
  - Browser focus: `window.addEventListener("focus", handleForeground)` at `1495`.
  - Visibility change: `document.addEventListener("visibilitychange", handleForeground)` at `1496`; hidden documents return `poll_hidden` at `1399-1401`.
- In-flight guard:
  - `remoteSessionPollInFlightRef` declared at `ProcessStage.jsx:399`.
  - Busy return at `1398`; reset in `finally` at `1462-1464`.
- Expected response:
  - `apiGetBpmnVersions` returns `{ ok, status, versions, items, count, user_facing_count, latest_user_facing_revision_number, session_id, current_session_payload_hash, current_session_version, current_session_updated_at, latest_user_version_session_payload_hash, has_session_changes_since_latest_bpmn_version }`.
  - Backend `items[0]` additionally includes `id`, `version_number`, `diagram_state_version`, `session_payload_hash`, `session_version`, `session_updated_at`, `source_action`, `import_note`, `created_at`, `created_by`, `author_id`, `author_name`, `author_email`, `author_display`, `author`.
- Fields currently used by polling:
  - `head.versions/head.items[0].diagram_state_version`.
- Fields available but currently ignored by polling:
  - `items[0].created_by`, `author_id`, `author_name`, `author_email`, `author_display`, `author`, `created_at`, `source_action`, `session_payload_hash`.

Verdicts:

- `VERSION_LIMIT_1_POLL_EXISTS`: yes.
- `VERSION_LIMIT_1_POLL_HAS_ACTOR_FIELDS`: yes, on `items[0]`.
- `VERSION_LIMIT_1_POLL_LACKS_ACTOR_FIELDS`: no for BPMN version author; yes for true active-user presence.
- `POLLING_CAN_BE_REUSED_WITHOUT_NEW_REQUESTS`: yes for remote update toast text and actor display from latest version head.
- `POLLING_RESPONSE_NORMALIZER_DROPS_NEEDED_FIELDS`: no for per-item actor fields; `items` are passed through raw. It does not create a top-level latest actor alias.

## Remote Update Detection Verdict

Current detection path:

1. Poll latest BPMN version head with `limit: 1`.
2. Read `latestHead.diagram_state_version`.
3. Compare it to `max(remoteSessionPollSeenDiagramStateVersionRef, getBaseDiagramStateVersion()/draft diagram version)`.
4. If newer, fetch full session with `apiGetSession(sid)`.
5. Read `session.diagram_last_write_actor_user_id`, `diagram_last_write_actor_label`, `diagram_last_write_at`, `diagram_last_write_changed_keys`.
6. If actor id matches current user id, auto-sync and clear highlight.
7. If not self and local state is safe, compute changed element ids from current XML vs server XML and show pending refresh highlight.

Self-vs-remote classification exists, but it depends on session last-write actor fields from the full session fetch, not the version head. Version head actor fields are currently unused.

Dedupe exists at two layers:

- Poll dedupe/baseline: `remoteSessionPollSeenDiagramStateVersionRef`.
- Badge dedupe: only update badge if new `serverVersion` is greater than previous badge version.

Remote update classes currently covered:

- BPMN/head `diagram_state_version` changed.
- Full session `diagram_last_write_changed_keys` says whether `bpmn_xml` or data changed.
- XML diff identifies changed BPMN element ids when both previous and next XML are available.
- Save conflicts are handled separately through CAS conflict payload and save conflict modal/toast.

Verdicts:

- `REMOTE_UPDATE_DETECTION_EXISTS`: yes.
- `REMOTE_UPDATE_SELF_REMOTE_CLASSIFICATION_EXISTS`: yes, via session last-write actor id after `apiGetSession`.
- `REMOTE_UPDATE_ACTOR_UNKNOWN`: not for full-session path when last-write fields are present; can be unknown/fallback if actor fields are empty.
- `REMOTE_UPDATE_DEDUPE_MISSING`: no; basic version dedupe exists.
- `HEADER_REMOTE_NOTICE_PRESENTATION_ONLY_PROBLEM`: yes; state/action are useful, but toolbar badge presentation is the problem.
- `REMOTE_UPDATE_MODEL_TOO_WEAK_FOR_ACTOR`: no for BPMN latest-version actor display; yes for "who is currently in session".

## Header Inline Notice Verdict

Remote inline header block:

- Rendered in `ProcessStageHeader.jsx:183-207`.
- Enabled by `remoteSaveHighlightView.visible === true && !showConflictModalActive` at `ProcessStageHeader.jsx:67`.
- Shows:
  - badge text: `remoteSaveHighlightView.label`.
  - refresh button: `remoteSaveHighlightView.refreshLabel || "Обновить сессию"`.
  - busy state: `"Обновляем..."`.
- State comes from `ProcessStage.jsx:417-419`, `1505-1521`.
- Refresh action comes from `applyPendingRemoteSaveRefresh` at `ProcessStage.jsx:1223-1275`.

Other technical header notices:

- `ProcessStageHeader.jsx:208-216` still renders `saveUploadStatus` as `diagram-toolbar-save-upload-status`.
- Save/status messages already have toast bridging in `ProcessStage.jsx:942-952` and `999-1018`, and tests explicitly assert status feedback is toast-based.

Verdicts:

- `HEADER_REMOTE_UPDATE_BLOCK_EXISTS`: yes.
- `HEADER_TECHNICAL_NOTICES_MIXED`: yes; remote update and upload status badges still occupy toolbar status cluster.
- `HEADER_PRESENTATION_CAN_MOVE_TO_TOAST_FRONTEND_ONLY`: yes for message text; yes for action only if `ProcessSaveAckToast` is extended to support actions/persistent mode.
- `HEADER_STATE_USED_ELSEWHERE_DO_NOT_REMOVE`: yes; `serverSession`, changed ids, busy state, and refresh callback are used by the refresh flow.

## Toast / Notification Surface Verdict

Existing process toast:

- State and emitter: `ProcessStage.jsx:903-935`.
- Renderer: `ProcessSaveAckToast.jsx`.
- Render site: `ProcessStage.jsx:6173-6177`.
- Anchor: `data-testid="diagram-toolbar-notification-anchor"` in `ProcessStageHeader.jsx:169-173`.
- Duration: `SAVE_ACK_TOAST_HIDE_MS = 4000`.
- Tone support: `success`, `info`, `warning`, `error` by CSS class.
- Classification: `processToastMessage.js` maps remote messages to source `remote_user`.

Support matrix:

| Capability | Supported now | Evidence |
| --- | --- | --- |
| Message | yes | `ProcessSaveAckToast` `message` prop |
| Severity/tone | yes | `tone` prop and `resolveToneClass` |
| Action button | no | props only `visible/message/tone` |
| Dedupe key | no explicit key | only caller-side signature refs for some save/status flows |
| Timeout | yes | 4s timer in `showSaveAckToast` |
| Persistent notification | no | timer always set |
| Manual close | no | no close prop/button |

Verdicts:

- `TOAST_SURFACE_EXISTS`: yes.
- `TOAST_SUPPORTS_ACTION`: no.
- `TOAST_LACKS_ACTION_REQUIRES_EXTENSION`: yes, if "Обновить сессию" must move with the notice.
- `SECOND_NOTIFICATION_SYSTEM_RISK`: yes, if remote update adds a separate notification component instead of extending current process toast.
- `REMOTE_UPDATE_TOAST_FRONTEND_ONLY_FEASIBLE`: yes for passive notification text; yes for full header replacement only with frontend toast action extension.

## Actor / User Display Verdict

Actor fields available now:

- Version head route item fields:
  - `created_by`
  - `author_id`
  - `author_name`
  - `author_email`
  - `author_display`
  - `author`
- Backend author display source:
  - `_build_bpmn_version_author(created_by)` uses `find_user_by_id`, then name/full_name/display/email fallback.
- Session last-write fields:
  - `diagram_last_write_actor_user_id`
  - `diagram_last_write_actor_label`
  - `diagram_last_write_at`
  - `diagram_last_write_changed_keys`
- Session table has those fields and `_session_api_dump` returns model dump, so `apiGetSession` passes them through.

Current frontend use:

- `readServerLastWriteFromSession` reads session last-write actor fields.
- Polling ignores version head author fields.

Feasible without new requests:

- For remote update toast copy, read `headItems[0].author_display || author_name || author_email || created_by`.
- Fallback: `Другой пользователь`.
- To avoid false self notifications, compare `headItems[0].author_id || created_by` to `currentUserId` as a head-level early classification, but keep existing session last-write self classification if the full refresh snapshot is still fetched.

Verdicts:

- `ACTOR_DISPLAY_AVAILABLE_NOW`: yes for latest BPMN version author.
- `ACTOR_ID_ONLY_AVAILABLE`: no; display fields are already present.
- `ACTOR_DISPLAY_REQUIRES_BACKEND_RESPONSE_ENRICHMENT`: no for BPMN version updates; maybe yes for non-BPMN/session-only updates if they are not represented by the latest version item.
- `ACTOR_DISPLAY_REQUIRES_NEW_USER_LOOKUP_FORBIDDEN`: no; current route already enriches author server-side.
- `FALLBACK_OTHER_USER_REQUIRED`: yes, because fields can be empty/unknown or self/remote ambiguity can remain for some classes.

## Presence / Current Session Users Verdict

Current "presence" code exists, but it is not a backend presence model.

Current behavior:

- Local current user is inserted into `sessionPresenceActors` and touched every `SESSION_PRESENCE_HEARTBEAT_MS = 45000`.
- Actors are pruned with `SESSION_PRESENCE_TTL_MS = 180000`.
- Remote actors are inserted only when `apiGetSession` exposes `diagram_last_write_actor_*` during remote update detection.
- Header displays `В сессии: {names}` if there are other actors after filtering current user.

Why this is not "who is currently in session":

- There is no backend `session_presence` table/API found.
- No websocket/SSE/Jazz server presence was found in audited source.
- No active-tab/client heartbeat is sent to the server.
- A remote actor can appear because they saved recently, not because they are currently viewing the session.
- `/bpmn/versions?limit=1` tells the latest saved version author, not active viewers.

Minimal real presence model if product requires it:

- Backend state: `session_presence`.
- Fields: `session_id`, `org_id`, `user_id`, `client_id`, `last_seen_at`, optional `display_name`, optional `active_surface`.
- TTL: product-defined, likely 60-180 seconds.
- Writes: preferably piggyback on existing session/BPMN API calls where possible, but active tab presence still needs a heartbeat or another existing frequent request that carries client identity.
- Reads: must be included in an existing response or a new endpoint; no honest active-users UI can be built from latest version alone.

Verdicts:

- `PRESENCE_MODEL_MISSING`: yes for true server-backed active users.
- `PRESENCE_CAN_BE_INFERRED_FROM_EXISTING_POLLS_FALSE`: yes.
- `PRESENCE_REQUIRES_BACKEND_STATE`: yes.
- `PRESENCE_CAN_PIGGYBACK_ON_EXISTING_REQUESTS_PARTIAL`: yes for writes/touches on existing requests, not enough for display unless response includes presence.
- `ACTIVE_USERS_DISPLAY_REQUIRES_PRODUCT_DECISION`: yes.

## No-New-Requests Feasibility Matrix

| Change | No new frontend requests? | Backend/API change? | Feasible now? | Notes |
| --- | --- | --- | --- | --- |
| Move remote update message from header badge to current toast as passive text | yes | no | yes | Reuse current state and/or head actor. |
| Show actor in remote update toast from `/bpmn/versions?limit=1` | yes | no | yes | Use `items[0].author_display` fallback chain. |
| Preserve `Обновить сессию` action inside toast | yes | no | frontend-only extension | Extend `ProcessSaveAckToast` props for action/persistent/manual close. |
| Remove header remote badge presentation | yes | no | yes, after toast action exists | Do not remove `remoteSaveHighlightBadge` state yet. |
| Avoid `apiGetSession` after newer head | yes relative future | maybe no, but loses current refresh snapshot | not safe in same PR | Current refresh flow needs full `serverSession`; version head does not include XML/session payload. |
| Actor display for non-BPMN/session-only updates | yes only if existing response includes it | maybe | limited | Session last-write fields have actor label after `apiGetSession`; version head may not represent every session-only change. |
| True "who is in session now" | no | yes | no | Requires server presence state and a read source. |

Verdicts:

- `NO_NEW_REQUESTS_FRONTEND_TOAST_FEASIBLE`: yes.
- `NO_NEW_REQUESTS_ACTOR_FEASIBLE_IF_RESPONSE_ALREADY_HAS_FIELDS`: yes; it does.
- `NO_NEW_REQUESTS_ACTOR_REQUIRES_RESPONSE_ENRICHMENT`: no for BPMN latest-version actor; maybe for broader session-only actor coverage.
- `NO_NEW_REQUESTS_PRESENCE_NOT_FEASIBLE_WITHOUT_RESPONSE_CHANGE`: yes.

## Product Decisions Required

1. Actor scope:
   - Should actor display be required only for BPMN/version updates, or for every session mutation class?
   - If every class, decide whether session last-write fields are enough, or whether the version response must include latest session-write actor too.
2. Fallback:
   - Is `Сессию обновил другой пользователь` acceptable when actor fields are missing?
3. Presence meaning:
   - Active tab right now?
   - Recently active within N seconds/minutes?
   - Last editor?
   - Collaborators with open session?
4. Active users placement:
   - Header compact avatars/text?
   - Sidebar?
   - Toast only on update?
   - Hide until robust server presence exists?
5. Remote update toast lifecycle:
   - Persistent until refresh?
   - Auto-dismiss but keep secondary refresh action elsewhere?
   - Manual close?
6. Dismiss semantics:
   - Suppress only current version/hash?
   - Suppress all future remote updates until user refreshes?

## Recommended Implementation PR Stack

### 1. `uiux/remote-session-update-toast-from-version-poll-v1`

Scope:

- Frontend-only.
- Reuse current `/bpmn/versions?limit=1` polling.
- Read `headItems[0].author_display || author_name || author_email || created_by`.
- Show remote update through the existing process toast surface.
- Extend `ProcessSaveAckToast` minimally if the refresh action must move with the notice:
  - `actionLabel`
  - `onAction`
  - `persistent`
  - `onDismiss`
  - optional dedupe key at caller level
- Remove remote update badge/button from `ProcessStageHeader` only after toast action can replace it.
- No new requests, no changed polling frequency, no changed limit.

Acceptance:

- Header remote update block gone.
- Toast appears once per remote update version.
- Refresh action preserved.
- Actor shown when available from version head.
- Fallback text: `Сессию обновил другой пользователь`.
- No new network calls.
- `/bpmn/versions?limit=1` remains unchanged.

Likely files:

- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/process/stage/ui/ProcessSaveAckToast.jsx`
- `frontend/src/features/process/stage/ui/processToastMessage.js`
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
- source/unit tests under `frontend/src/components` and `frontend/src/features/process/stage/ui`

### 2. `backend/remote-session-version-poll-actor-enrichment-v1`

Only needed if product decides version author is insufficient.

Current audit says BPMN version actor display is already present, so this PR is not required for the narrow "latest BPMN update author" case.

Potential scope if needed:

- Extend the existing `/bpmn/versions?limit=1` response with top-level latest actor aliases or latest session-write actor.
- No new endpoint.
- No extra frontend request.

Acceptance:

- Response includes the required actor display for the chosen remote update class.
- Frontend toast shows `Сессию обновил {name/email}`.

### 3. `feature/remote-session-presence-model-v1`

Only if product still requires "кто сейчас в сессии".

Scope:

- Define exact/approx presence semantics.
- Add backend presence state with TTL/client id.
- Prefer piggyback writes on existing requests where possible.
- Provide a read source without heavy polling, either included in an existing response or a carefully justified endpoint.

Acceptance:

- Active users shown accurately enough for the chosen semantics.
- No misleading "currently in session" copy from latest-save inference.
- Privacy/permissions are clear.

### 4. `uiux/session-header-clean-technical-notices-v1`

Optional follow-up if header cleanup should cover more than remote update.

Scope:

- Move remaining technical save/upload/version notices out of header into toast/status surface.
- Keep header for navigation/actions/compact stable state only.

## Exact Files Likely To Change Later

Frontend:

- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
- `frontend/src/features/process/stage/ui/ProcessSaveAckToast.jsx`
- `frontend/src/features/process/stage/ui/processToastMessage.js`
- `frontend/src/features/process/stage/ui/remoteSaveHighlightModel.js`
- tests:
  - `frontend/src/components/ProcessStage.session-presence-remote-save.test.mjs`
  - `frontend/src/features/process/stage/ui/ProcessStageHeader.*.test.mjs`
  - `frontend/src/features/process/stage/ui/ProcessSaveAckToast.*.test.mjs`
  - `frontend/src/features/process/stage/ui/processToastMessage.test.mjs`

Backend only if presence or broader actor response is required:

- `backend/app/_legacy_main.py`
- `backend/app/storage.py`
- backend tests for BPMN versions/presence.

## Backend / API Risk Map

- Low risk: using existing version item `author_display` in frontend.
- Medium risk: extending process toast with action/persistent behavior; needs careful layout and no overlap with toolbar.
- Medium risk: removing header remote block before action replacement; could strand the refresh flow.
- Medium risk: using version author as actor for all remote session changes; latest version author may not represent every session-only write class.
- High risk: real presence; requires schema/API/product semantics.
- Forbidden in first implementation PR:
  - Increasing `/bpmn/versions?limit=1`.
  - Adding user lookup requests.
  - Adding presence polling.
  - Adding session refresh solely for actor display.

## Runtime Validation Plan For Future Implementation

1. Open ProcessStage in two authenticated users/tabs.
2. Save a BPMN change in user B.
3. Confirm user A keeps the same polling request: `/api/sessions/{id}/bpmn/versions?limit=1`.
4. Confirm no new network calls are introduced on idle polling.
5. Confirm toast says `Сессию обновил {actor}` when `author_display` is present.
6. Confirm fallback says `Сессию обновил другой пользователь`.
7. Confirm header remote update badge/button no longer appears.
8. Confirm refresh action still applies remote session state.
9. Confirm same-user saves do not show remote-user toast.
10. Confirm toast dedupes the same remote version/hash.
11. Confirm save conflict modal/toast still works.
12. Confirm no console errors and no layout overlap on narrow viewport.
