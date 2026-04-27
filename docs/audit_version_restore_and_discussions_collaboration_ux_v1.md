# Audit: Version Restore and Discussions Collaboration UX v1

Date: 2026-04-27
Contour: `audit/version-restore-and-discussions-collaboration-ux-v1`
Epic: Versioning Restore / Discussions Collaboration
Mode: audit-only, product code unchanged

## 0. Strict Scope

- No backend/API/schema changes.
- No UI/product code changes.
- No deploy.
- Output artifact only: this markdown document.
- Future implementation contours must pass review before merge.

## 1. Runtime / Source Truth

| Item | Value |
| --- | --- |
| Worktree path | `/Users/mac/PycharmProjects/processmap_version_restore_discussions_audit_v1` |
| Remote | `origin git@github.com:xiaomibelov/processmap_v1.git` |
| Branch | `audit/version-restore-and-discussions-collaboration-ux-v1` |
| HEAD | `d2c67f8ea0006c1f8ca5b35840dd92415574f6a4` |
| origin/main | `d2c67f8ea0006c1f8ca5b35840dd92415574f6a4` |
| merge-base | `d2c67f8ea0006c1f8ca5b35840dd92415574f6a4` |
| git status at bootstrap | clean: `## audit/version-restore-and-discussions-collaboration-ux-v1...origin/main` |
| App version source | `frontend/src/config/appVersion.js` |
| Active app version in source | `v1.0.24` |
| Known stage session | `https://stage.processmap.ru/app?project=b12ff022e8&session=17533cfbfd` |
| Known restore error | `POST /api/sessions/17533cfbfd/bpmn/restore/3151147c68f8 -> 409 Conflict` |
| Stage runtime checked | No. This contour used source truth only. |
| Active frontend bundle asset | Not captured; stage was not inspected. |

Recent source head:

```text
d2c67f8 Merge pull request #189 from xiaomibelov/fix/bpmn-version-history-user-facing-count-v1
0ef7a58 fix: keep BPMN history numbering server-backed
e27beda Merge pull request #188 from xiaomibelov/uiux/remove-derived-context-surface-from-process-pages-v1
cd90bfd uiux: add app version updates page
3a7132a Merge pull request #187 from xiaomibelov/uiux/remove-derived-context-surface-from-process-pages-v1
```

## 2. GSD Proof

Commands checked:

```text
which gsd -> gsd not found
which gsd-sdk -> /Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk
gsd --version -> zsh:1: command not found: gsd
gsd-sdk --version -> gsd-sdk v0.1.0
gsd-sdk query init.phase-op audit/version-restore-and-discussions-collaboration-ux-v1 -> exit 0
```

`init.phase-op` result:

- `planning_exists: false`
- `roadmap_exists: false`
- `phase_found: false`
- `agents_installed: false`
- missing agents include `gsd-planner`, `gsd-phase-researcher`, `gsd-plan-checker`, `gsd-verifier`, and related GSD agents.

GSD discuss result:

- User problem: version restore does not behave like understandable version switching and fails with 409.
- User problem: discussions do not behave like a normal collaboration/chat surface.
- User cannot clearly see active participated discussions, unread/new messages, linked element navigation, `@mentions`, quotes, Markdown.
- Non-goals: no code changes, no backend/schema changes, no UI changes, no deploy, no broad redesign implementation.
- Audit goal: split into prioritized bounded implementation contours; do smallest safe fixes first; push bigger chat redesign/model decisions last.

GSD plan result:

1. Version restore source areas: `frontend/src/lib/api.js`, `frontend/src/components/ProcessStage.jsx`, `frontend/src/features/process/stage/ui/ProcessDialogs.jsx`, `backend/app/_legacy_main.py`, `backend/tests/test_diagram_cas_guard.py`, `frontend/src/lib/apiCore.js`.
2. Discussions source areas: `backend/app/routers/notes.py`, `backend/app/storage.py`, `frontend/src/components/NotesMvpPanel.jsx`, `frontend/src/features/notes/discussionNotificationModel.js`, `frontend/src/lib/api.js`, `frontend/src/lib/apiRoutes.js`, `frontend/src/lib/sessionNoteAggregates.js`.
3. Runtime scenarios to inspect later: restore old version on stage, open/create element-scoped discussion, click notification, mention user, reply in thread.
4. Data/API maps to build: restore CAS flow; note thread/comment/mention/attention tables; aggregate and notification read paths.
5. Root-cause verdicts to produce: restore 409, version switching semantics, participated threads, unread state, linked element navigation, mentions, quote/Markdown.
6. Priority criteria: smallest safe fix first, UX-only before schema/API where source supports it, unread semantics before unread UI, chat redesign last.
7. Output artifact: this audit markdown.
8. Stop conditions: dirty worktree, GSD unavailable without approval, need for product code edits, backend/API/schema change, deploy request.

## 3. Version Restore Audit

### Source Map

| Area | Source proof | Finding |
| --- | --- | --- |
| Frontend restore API | `frontend/src/lib/api.js:937-954` | `apiRestoreBpmnVersion(sessionId, versionId)` posts `{}` only. It does not send `base_diagram_state_version`, `rev`, query param, or `If-Match`. |
| Restore button flow | `frontend/src/components/ProcessStage.jsx:4262-4280` | User confirms destructive restore, then frontend calls `apiRestoreBpmnVersion(sid, versionId)` without refreshing context or passing current base version. |
| Restore modal copy | `frontend/src/features/process/stage/ui/ProcessDialogs.jsx:351-379` | UI has `Предпросмотр XML`, `Сравнить`, `Восстановить`. Preview is XML-only, not a diagram preview/switch mode. |
| Backend route | `backend/app/_legacy_main.py:6387-6426` | Restore route loads session, checks edit permission, resolves base version from body/header/query, then calls strict CAS. |
| CAS rule | `backend/app/_legacy_main.py:827-860` | Real HTTP requests require client base version; missing base returns 409 with code `DIAGRAM_STATE_BASE_VERSION_REQUIRED`, stale base returns `DIAGRAM_STATE_CONFLICT`. |
| Restore semantics | `backend/app/_legacy_main.py:6453-6486` | Restore mutates current session `bpmn_xml`, marks diagram truth write, creates a new snapshot with `source_action="restore_bpmn_version"`, then saves. |
| Test proof | `backend/tests/test_diagram_cas_guard.py:311-319` | Stale restore is expected to raise 409 `DIAGRAM_STATE_CONFLICT`. |
| Error surfacing | `frontend/src/lib/apiCore.js:125-159`, `frontend/src/features/process/lib/userFacingErrorText.js:52-57` | Error text tends to collapse to code/JSON, so restore conflict is not translated into a useful user action. |

### Data Flow

1. User opens BPMN versions modal.
2. UI loads versions via `apiGetBpmnVersions`.
3. User clicks `Восстановить`.
4. UI confirms destructive replacement.
5. UI calls `POST /api/sessions/{sid}/bpmn/restore/{versionId}` with empty JSON body.
6. Backend requires current `base_diagram_state_version` for real HTTP requests.
7. Because no base is sent, backend can return 409 `DIAGRAM_STATE_BASE_VERSION_REQUIRED`; if a future frontend sends stale base, backend returns `DIAGRAM_STATE_CONFLICT`.
8. If CAS passes, backend replaces current BPMN XML and creates a new current version snapshot. Restore is not a non-destructive version switch.

### Required Answers

| Question | Answer |
| --- | --- |
| Restore means "restore as current schema" or "view old version"? | Current implementation means "restore as current schema". It overwrites current session BPMN XML and creates a new snapshot. |
| Can user select an old version without overwriting current? | Not as a diagram state. Existing preview is XML-only and compare-first; no non-destructive diagram preview/switch mode exists in the audited source. |
| Can user later return to newer version? | Usually yes only if the previous current BPMN was captured as a version/snapshot and is visible/selectable. The model is restore-forward, not toggling a pointer. |
| Why 409 occurs now? | Most likely frontend restore omits required CAS base version. Source proof shows empty body from API client and strict backend CAS requiring base for HTTP. Known 409 may be `DIAGRAM_STATE_BASE_VERSION_REQUIRED` or stale `DIAGRAM_STATE_CONFLICT`; exact body needs HAR/runtime capture. |
| Minimal fix or preview model? | First fix should be restore CAS/base handling and conflict copy. Preview/switching semantics are a separate product contour. |

### Surface Table

| Surface/API | Current behavior | User expectation | Risk | Verdict |
| --- | --- | --- | --- | --- |
| `POST /bpmn/restore/{version_id}` | Destructive current BPMN replacement, strict CAS required. | Understandable restore or switch between versions. | High: current user action fails with 409. | `FRONTEND_STALE_BASE_VERSION`, specifically missing base in source. |
| Versions modal | XML preview and diff, then restore. | Select old version like a normal version state and move back/forth. | Medium-high: semantics mismatch creates data-loss anxiety. | `RESTORE_IS_DESTRUCTIVE_NOT_PREVIEW`, `VERSION_SWITCHING_SEMANTICS_UNDEFINED`. |
| Conflict UX | Generic code/short error likely shown. | Explain why restore cannot proceed and offer refresh/retry. | Medium: user cannot self-recover. | `RESTORE_CONFLICT_MESSAGE_MISSING`. |
| Backend CAS | Correctly strict for writes. | Restore should work when user has current state. | Low-medium: backend behavior is intentional for write safety. | Not `BACKEND_RESTORE_CAS_TOO_STRICT` as first verdict. |

Recommended first implementation contour:

`fix/bpmn-restore-version-409-conflict-v1`

Scope:

- Send current `base_diagram_state_version` in restore request.
- Refresh session/version context before restore if local base is absent/stale.
- Translate `DIAGRAM_STATE_BASE_VERSION_REQUIRED` and `DIAGRAM_STATE_CONFLICT` into actionable restore copy.
- After successful restore, update local diagram state version from backend response.
- Add focused tests around `apiRestoreBpmnVersion` body and restore flow.

Separate later contour:

`feature/bpmn-version-preview-switching-semantics-v1`

Scope:

- Decide whether old versions are preview-only, restore-forward, or a true selectable current pointer.
- Do not mix this with the 409 fix.

## 4. Discussions Active / Participation / Unread Audit

### Source Map

| Area | Source proof | Finding |
| --- | --- | --- |
| Thread API | `backend/app/routers/notes.py:274-315` | Session threads can be created/listed with `status`, `scope_type`, `element_id`. No participated-only endpoint. |
| Thread schema | `backend/app/storage.py:819-848` | `note_threads` has status/priority/attention/created_by/timestamps; `note_comments` has author/body/timestamps. |
| Mentions schema | `backend/app/storage.py:855-870` | Mentions have per-user `acknowledged_at`, but this is mention-specific, not thread read-state. |
| Attention ack schema | `backend/app/storage.py:871-882` | Per-user attention ack exists, but only for `requires_attention`. |
| Aggregate API | `backend/app/routers/notes.py:184-231` | Aggregates return open count, attention count, personal count. |
| Aggregate logic | `backend/app/storage.py:6307-6350`, `6935-7018` | `personal_discussions_count` means open + requires_attention + created_by me + not acknowledged. It is not "threads where I participated". |
| Frontend panel | `frontend/src/components/NotesMvpPanel.jsx:327-482`, `495-527` | Panel lists session threads with filters and search; no "Мои обсуждения" filter. |
| Notifications | `frontend/src/features/notes/discussionNotificationModel.js:69-116` | Notification buckets are derived only from `requires_attention` and acknowledgement/resolved status. |
| Badge | `frontend/src/components/NotesAggregateBadge.jsx:15-29` | Badge shows open discussion count only. |

### Need Table

| Need | Current support | Missing data? | Frontend-only? | Backend/API needed? |
| --- | --- | --- | --- | --- |
| See active session discussions | Yes, per current session via `apiListNoteThreads`. | No for current session. | Mostly yes. | No. |
| See topics where user participates | Partially derivable client-side for current session if full comments are loaded: created_by/comment author/mentioned user. Not available as first-class API/filter. | Missing for cross-session and efficient lists. | Current session only can be frontend-derived. | Yes for durable "My discussions" across sessions/projects. |
| See new/unread message counts | No. | Yes: no `last_read_at`, per-thread read markers, or unread counters. | No, except misleading heuristics. | Yes, schema + API. |
| Notifications for all new messages | No. Current notification model is attention-derived and mention-derived elsewhere. | Yes. | No. | Yes if unread semantics are required. |
| Attention queue | Yes. | No for attention-only. | Yes. | Existing API supports it. |
| Mentions queue | Yes, via `/api/note-mentions`. | No for explicit mention ack. | UI exists elsewhere; composer is weak. | Existing API supports basic mentions. |

### Required Answers

| Question | Answer |
| --- | --- |
| Can the app currently determine topics where user participated? | For loaded current-session threads, yes by scanning `created_by`, comment `author_user_id`, and comment mentions. As source truth/API semantics, no dedicated participated endpoint/filter exists. |
| Can the app currently determine new messages? | No. There is no per-user thread read state or `last_read_at`. |
| Is there per-user read state? | No for threads/messages. Only attention acknowledgements and mention acknowledgements exist. |
| Can we temporarily show "участвую" without unread? | Yes for the currently loaded session, as a UX-only filter/badge derived from thread/comment authors and mentions. It must not claim unread/new. |
| Are notifications tied only to attention/mentions or wider? | Discussion notification buckets are attention-only. Separate note mention notifications exist through `/api/note-mentions`. No general new-message notification model exists. |
| Difference between terms | Active discussion = usually open thread. My discussion = undefined; should become created/commented/mentioned/assigned. Requires attention = explicit thread flag plus per-user ack. New messages = impossible until read-state is defined. |

Verdicts:

- `PARTICIPATION_DATA_EXISTS_UI_MISSING` for current-session loaded threads.
- `PARTICIPATION_DATA_MISSING` for cross-session/project-level "topics I participate in".
- `UNREAD_STATE_MISSING`.
- `ATTENTION_CONFUSED_WITH_NOTIFICATION`.
- `MY_DISCUSSIONS_SURFACE_INCOMPLETE`.
- `NOTIFICATION_SEMANTICS_UNDEFINED` for new-message notifications.

Recommended contours:

1. `uiux/discussions-participated-threads-surface-v1`
   - Current-session only.
   - Add a "Мои" / participated filter derived from existing loaded thread data.
   - Explicitly avoid unread counts.
2. `feature/discussions-unread-counts-and-read-state-v1`
   - Add per-user thread read markers, semantics, API, counts, and UI.
   - Should precede any "new messages" badge promise.

## 5. Discussion Element Context Navigation Audit

### Source Proof

| Current linked context | Can navigate? | Missing seam | Suggested fix |
| --- | --- | --- | --- |
| Element-scoped thread stores `scope_ref.element_id`, `element_name`, `element_type` via `buildScopeRef` in `frontend/src/components/NotesMvpPanel.jsx:283-291`, persisted in `note_threads.scope_ref_json`. | Only attention notification click calls `onFocusNotificationTarget` if `targetElementId` exists (`NotesMvpPanel.jsx:622-640`). Regular thread header/card has no obvious "go to element" action. | The panel lacks a direct thread-level action to focus linked element. Existing App bridge sets diagram tab and selected element but does not visibly call BPMN canvas focus. | Add a "focus linked element" action in thread header/list for `scope_type=diagram_element`, call App bridge, switch to Diagram tab, select/focus/pulse element. |
| BPMN focus helper exists in runtime: `createBpmnRuntime.js:385-403`; imperative selection/focus exists in `bpmnStageImperativeApi.js:705-729`. | Yes, source contains reusable focus/select primitives. | The notes/discussions panel is not wired to those primitives for normal linked context navigation. | Reuse existing `bpmnRef.current?.focusNode`/selection path; handle missing/deleted element. |
| App notification bridge exists: `App.jsx:1850-1862`. | Partial. It sets diagram tab and calls `focusElementNotes`, which updates selected element/sidebar state. | It does not prove canvas centering/highlight because no `bpmnRef.current?.focusNode` call is visible in this path. | Extend bridge or add dedicated `focusDiscussionElementTarget` that calls canvas focus. |

Verdicts:

- `ELEMENT_CONTEXT_STORED_NAV_MISSING`
- `FOCUS_HELPER_EXISTS_NOT_WIRED`
- `DIAGRAM_TAB_SWITCH_REQUIRED`
- `ELEMENT_DELETED_OR_STALE_CONTEXT_UNHANDLED`

Recommended contour:

`fix/discussion-linked-element-focus-navigation-v1`

Likely frontend-only if current BPMN element IDs are sufficient. It should include missing-element copy and tests for the bridge.

## 6. @mentions Audit

### Source Proof

| Feature | Current support | Missing pieces | Suggested contour |
| --- | --- | --- | --- |
| User directory | `/api/sessions/{session_id}/mentionable-users` from `backend/app/routers/notes.py:254-258`; includes `user_id`, `label`, `email`, `full_name`, `job_title`. | Scope semantics should be confirmed: project members if present, otherwise org members. | Reuse existing endpoint first. |
| Mention model | `mention_user_ids` accepted on create/comment (`notes.py:21-32`, `274-329`); stored in `note_comment_mentions` with `acknowledged_at`. | Mention ids are supplied out-of-band, not parsed from message text. | `feature/discussions-at-mention-autocomplete-v1`. |
| Current composer | Create/reply UI uses plain `<textarea>` plus separate `Упомянуть` `<select>` (`NotesMvpPanel.jsx:1024-1049`, `1271-1301`). | No inline `@` autocomplete, no multiple mentions through text, no deletion sync. | Replace/selectively enhance composer. |
| Rendering | Mentions rendered as chips after message (`NotesMvpPanel.jsx:1207-1215`). | No inline mention rendering in message body. | Keep chips initially or move inline later. |
| Notifications | `/api/note-mentions` lists active unacknowledged mentions; ack endpoint exists. | No general message notifications; mention notifications are separate. | Mention autocomplete can use existing notification model. |

Verdicts:

- `MENTION_DATA_EXISTS_NO_COMPOSER`
- `MENTION_MODEL_EXISTS_NO_AUTOCOMPLETE`
- `USER_DIRECTORY_AVAILABLE`
- `USER_DIRECTORY_SCOPE_UNDEFINED` only if "any user" means beyond project/org membership.
- `NOTIFICATION_ON_MENTION_EXISTS_BASIC`, not missing.

Recommended contour:

`feature/discussions-at-mention-autocomplete-v1`

Scope:

- Inline `@` autocomplete over existing mentionable users endpoint.
- Convert selected users to `mention_user_ids`.
- Decide whether body contains visible `@Label` text or mentions remain chips.
- Do not combine with unread.

## 7. Quotes + Markdown Audit

### Source Proof

| Feature | Current data support | Current UI support | Risk | Suggested contour |
| --- | --- | --- | --- | --- |
| Markdown rendering in discussions | Message body is raw text only: `note_comments.body`. | Rendered with `whitespace-pre-wrap` at `NotesMvpPanel.jsx:1206`. | Low XSS risk today because React escapes text, but no Markdown support. | `feature/discussions-markdown-rendering-v1`. |
| Existing markdown helper | `frontend/src/features/process/lib/markdownPreview.jsx:47-159` supports a limited React-rendered subset for reports. | Not used in NotesMvpPanel. No external markdown dependency in `frontend/package.json`. | Helper is limited and not a full CommonMark/chat renderer. | Reuse only if limited Markdown is acceptable. |
| Sanitization | No HTML rendering in discussion messages. Existing helper creates React nodes, not `dangerouslySetInnerHTML`. | Safe by default if kept React-node based. | Introducing external HTML markdown renderer would require sanitizer. | Prefer React-node renderer or add vetted sanitizer. |
| Quote/reply | No `reply_to`, `parent_message_id`, or quote field in schema/API/source search. | No quote button/action. | Needs data model if quotes should survive edits/deletes and link to original. | `feature/discussions-message-quote-reply-v1`. |
| Composer | Plain textarea plus separate mention select. | No preview, quote state, shortcuts, attachments. | Full chat composer is larger than Markdown alone. | `uiux/discussions-chat-surface-redesign-v1` after primitives. |

Verdicts:

- `MARKDOWN_RENDERER_EXISTS_NOT_USED` for a limited in-repo renderer.
- `MARKDOWN_MODEL_UNSAFE_OR_UNDEFINED` if moving beyond escaped text without sanitizer.
- `QUOTE_MODEL_MISSING`.
- `QUOTE_UI_MISSING`.
- `CHAT_COMPOSER_TOO_CUSTOM`.
- `NEEDS_CHAT_COMPOSER_DESIGN`.

Recommended contours:

1. `feature/discussions-markdown-rendering-v1`
   - Use React-node rendering or explicit sanitizer.
   - Keep raw text storage if only Markdown source is needed.
2. `feature/discussions-message-quote-reply-v1`
   - Add `parent_message_id` / `reply_to` model only after deciding quote semantics.
3. `uiux/discussions-chat-surface-redesign-v1`
   - Last, after mentions/unread/Markdown/quote primitives are settled.

## 8. Product Decision Matrix

| Problem | Can do frontend-only? | Needs backend/API? | Needs schema? | Risk | Recommended contour | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Restore 409 | Mostly frontend/API client if base version already available; maybe context refresh. | Maybe no backend if endpoint contract remains. | No. | High | `fix/bpmn-restore-version-409-conflict-v1` | 1 |
| Restore/switch semantics | No, unless only copy changes. | Likely yes for true preview/current pointer semantics. | Maybe. | High product ambiguity | `feature/bpmn-version-preview-switching-semantics-v1` | Later than 409 |
| Linked element navigation | Yes if element id exists and focus helper is reachable. | No for basic case. | No. | Medium | `fix/discussion-linked-element-focus-navigation-v1` | 2 |
| My participated discussions, current session | Yes by deriving from loaded thread/comment/mention data. | No for current-session MVP. | No. | Medium | `uiux/discussions-participated-threads-surface-v1` | 3 |
| My participated discussions, cross-session/project | No. | Yes. | Maybe no if query derives from existing comments, but likely indexes/API needed. | Medium | Later API extension | After current-session MVP |
| Unread/new message counts | No. | Yes. | Yes: per-user read markers. | High | `feature/discussions-unread-counts-and-read-state-v1` | 4 |
| @mention autocomplete | Mostly frontend using existing directory/model. | Existing API enough for scoped users. | No for basic one/many mention ids. | Medium | `feature/discussions-at-mention-autocomplete-v1` | 5 |
| Mention any user beyond scope | No. | Yes, if "any" means org/global user directory. | Maybe no. | Medium-high permissions risk | Include decision in mention contour | 5 |
| Markdown | Yes for limited React-node rendering. | No if raw Markdown text is enough. | No. | Medium security risk if HTML introduced. | `feature/discussions-markdown-rendering-v1` | 6 |
| Quote/reply | No for durable quote/reply. | Yes. | Yes. | Medium | `feature/discussions-message-quote-reply-v1` | 7 |
| Full chat composer redesign | No, because primitives affect data/API. | Yes for unread/reply integration. | Maybe. | High | `uiux/discussions-chat-surface-redesign-v1` | 8 |

Specific decisions:

- Version restore fix should be first.
- Element navigation can likely be done without backend.
- Participated discussions can be shown before unread, if explicitly scoped to current loaded session and not labeled as unread.
- Unread does not need to precede mentions. Mentions already have a basic model.
- Markdown can be safe without backend if rendered as React nodes from raw text and no raw HTML is allowed.
- Do not choose a heavy chat/editor component until unread, mentions, Markdown, and quote semantics are defined.

## 9. Prioritized Backlog

1. `fix/bpmn-restore-version-409-conflict-v1`
   - Fix restore CAS/base version request and conflict clarity.
   - Smallest critical fix because current restore fails.
2. `fix/discussion-linked-element-focus-navigation-v1`
   - Add direct focus/link action from element-scoped discussions.
   - Likely frontend-only.
3. `uiux/discussions-participated-threads-surface-v1`
   - Add current-session "Мои обсуждения" / participated filter without unread claims.
4. `feature/discussions-unread-counts-and-read-state-v1`
   - Define and implement per-user read state and unread counts.
5. `feature/discussions-at-mention-autocomplete-v1`
   - Inline `@` autocomplete using existing mentionable users and mention model.
6. `feature/discussions-markdown-rendering-v1`
   - Safe Markdown rendering; no raw HTML unless sanitized.
7. `feature/discussions-message-quote-reply-v1`
   - Durable reply/quote model and UI.
8. `uiux/discussions-chat-surface-redesign-v1`
   - Full chat surface/composer after primitives are stable.

## 10. Final Verdicts

| Area | Verdicts |
| --- | --- |
| Version restore | `FRONTEND_STALE_BASE_VERSION`, `RESTORE_CONFLICT_MESSAGE_MISSING`, `RESTORE_IS_DESTRUCTIVE_NOT_PREVIEW`, `VERSION_SWITCHING_SEMANTICS_UNDEFINED` |
| Discussions participation/unread | `PARTICIPATION_DATA_EXISTS_UI_MISSING`, `PARTICIPATION_DATA_MISSING`, `UNREAD_STATE_MISSING`, `ATTENTION_CONFUSED_WITH_NOTIFICATION`, `MY_DISCUSSIONS_SURFACE_INCOMPLETE`, `NOTIFICATION_SEMANTICS_UNDEFINED` |
| Linked element navigation | `ELEMENT_CONTEXT_STORED_NAV_MISSING`, `FOCUS_HELPER_EXISTS_NOT_WIRED`, `DIAGRAM_TAB_SWITCH_REQUIRED`, `ELEMENT_DELETED_OR_STALE_CONTEXT_UNHANDLED` |
| Mentions | `MENTION_DATA_EXISTS_NO_COMPOSER`, `MENTION_MODEL_EXISTS_NO_AUTOCOMPLETE`, `USER_DIRECTORY_AVAILABLE`, `USER_DIRECTORY_SCOPE_UNDEFINED` |
| Quotes/Markdown | `MARKDOWN_RENDERER_EXISTS_NOT_USED`, `MARKDOWN_MODEL_UNSAFE_OR_UNDEFINED`, `QUOTE_MODEL_MISSING`, `QUOTE_UI_MISSING`, `CHAT_COMPOSER_TOO_CUSTOM`, `NEEDS_CHAT_COMPOSER_DESIGN` |

## 11. Validation Plan

Audit-only validation:

```bash
git diff --check
git status -sb
git diff -- docs/audit_version_restore_and_discussions_collaboration_ux_v1.md
```

No full test suite needed because product code is unchanged.
