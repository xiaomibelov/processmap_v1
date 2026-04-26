# discussions-personal-notification-semantics-and-session-badge-v1

Status: frozen before bounded execution.

## Runtime/source truth

- Canonical checkout is dirty and must not be edited.
- Clean worktree: `/Users/mac/PycharmProjects/processmap_canonical_main/.worktrees/discussions_personal_notification_semantics_session_badge_v1`
- Branch: `feature/discussions-personal-notification-semantics-and-session-badge-v1`
- Base: current `origin/main`.
- Formal GSD SDK phase artifacts are unavailable: `.planning/ROADMAP.md` is absent and `gsd-sdk query init.phase-op`, `init.plan-phase`, and `init.execute-phase` all returned `phase_found=false`, `planning_exists=false`.
- GSD gates used manually: discuss/source map -> frozen design decisions -> frozen execution boundary -> bounded implementation plan.

## Source map

### Current personal-signal truth

- Mention signal:
  - Backend rows: `note_comment_mentions`.
  - Backend APIs: `GET /api/note-mentions`, `POST /api/note-mentions/{mention_id}/acknowledge` in `backend/app/routers/notes.py`.
  - Backend storage: `list_active_note_mentions_for_user`, `acknowledge_note_mention` in `backend/app/storage.py`.
  - Frontend API: `apiListMyNoteMentions`, `apiAcknowledgeNoteMention` in `frontend/src/lib/api.js`.
  - Topbar owner: `frontend/src/components/TopBar.jsx`.
- Attention acknowledgement:
  - Backend rows: `note_thread_attention_acknowledgements`.
  - Backend API: `POST /api/note-threads/{thread_id}/acknowledge-attention`.
  - Backend storage: `acknowledge_note_thread_attention`, `_thread_attention_acknowledged_at`.
- Inbox/history derivation:
  - Frontend pure model: `frontend/src/features/notes/discussionNotificationModel.js`.
  - Panel rendering/open/ack: `frontend/src/components/NotesMvpPanel.jsx`.
- Topbar/profile notification signal:
  - `TopBar.jsx` currently computes `accountNotificationCount = mentionCount + notesAggregate.attention_discussions_count`.
  - This is the false-positive seam because `attention_discussions_count` is aggregate discussion attention, not personal notification truth.

### My discussion / my question truth

- Reliable owner field exists: `note_threads.created_by`.
- `storage.create_note_thread(...)` writes `created_by` from authenticated `actor_user_id`.
- Thread DTO returns `created_by` through `_note_thread_row_to_dict`.
- Comments have `note_comments.author_user_id`, but there is no per-user unread/read marker.
- Therefore "my discussion" is safely representable as `note_threads.created_by == current_user_id`.
- "New activity in my discussion" is only safely actionable in this contour when it is already expressed by existing bounded attention truth: open thread, `requires_attention=1`, not acknowledged by me.

### Session/explorer badge truth

- Session-row inline discussion badge:
  - Owner: `frontend/src/features/explorer/WorkspaceExplorer.jsx`.
  - Component: `frontend/src/components/NotesAggregateBadge.jsx`.
  - Source: `GET /api/sessions/{session_id}/note-aggregate` -> `apiGetSessionNoteAggregate` -> `useSessionNoteAggregate`.
- Toolbar discussion badge:
  - Owner: `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx`.
  - Component: `NotesAggregateBadge`.
- Legacy explorer signal column:
  - Owner: `WorkspaceExplorer.jsx`.
  - Label/title currently says `Заметки и отчёты`.
  - Source is `session.reports_count` / `project.reports_count` from explorer payload, not discussion truth.

### Existing aggregate fields

- `open_notes_count`: open discussion/thread count in `note_threads`.
- `has_open_notes`: derived from `open_notes_count`.
- `attention_discussions_count`: current viewer-scoped unacknowledged `requires_attention` count, but not personal owner truth.
- `has_attention_discussions`: derived from `attention_discussions_count`.
- `note_comment_mentions`: active personal mention count is read separately through `GET /api/note-mentions`.
- Missing before this contour: aggregate field for personal discussion signal based on `note_threads.created_by`.

## Frozen design decisions

### Personal notification contract

Personal topbar/profile signal triggers only when:

1. The current user has active explicit discussion mentions.
2. Or an open discussion created by the current user has `requires_attention=1` and has not been acknowledged by the current user.

It does not trigger for:

- Simple creation of someone else's discussion.
- Someone else's attention discussion unless the current user is explicitly mentioned.
- Resolved discussions.
- Non-attention comments, because there is no bounded unread/read source truth.

### My discussion contract

Supported safely: yes, for ownership.

Rule: a discussion is "mine" when `note_threads.created_by` equals the current authenticated user id. It becomes a personal discussion signal only through the existing active attention truth: `status='open'`, `requires_attention=1`, and no acknowledgement row for that user.

### Session badge contract

Session/explorer discussion badge means: open discussions count for that session.

It is not a personal notification badge and not an unread/read badge. Attention is kept out of the session-row badge label to avoid misleading `!` semantics.

### Naming contract

- Discussion badge label: `Обсуждения`.
- Badge accessible text: `Открытые обсуждения: N`.
- Profile/menu personal discussion row: `Мои обсуждения`.
- Personal topbar title when active: `Профиль и уведомления: N`.
- Legacy `Заметки и отчёты` signal-column title becomes `Отчёты`, because that column is backed by `reports_count`, not discussions.

### Placement contract

- Keep the compact personal signal on the existing profile/person button.
- Keep the discussion aggregate badge in the current session row subtitle and existing diagram toolbar discussions button.
- Keep the discussion notification entry inside the profile menu.
- No broad Explorer redesign or relocation.

### Out of scope

- Global notification system.
- Unread/read message mechanics.
- Watcher/subscriber model.
- Team assignment.
- External delivery channels.
- Broad Explorer redesign.
- Discussions domain redesign beyond the exact personal signal and badge semantics.

## Frozen execution boundary

- "My discussion" safely supported or not: yes, as `note_threads.created_by == current_user_id`; no generic unread/read activity semantics.
- Minimal truth driving personal signal: active mentions plus active unacknowledged attention on my own open threads.
- Minimal aggregate/backend seam: add `personal_discussions_count` / `has_personal_discussions` to existing note aggregate read path.
- Exact replacement for old session badge semantics: `Обсуждения N` means open discussions count; no legacy `Заметки` label and no ambiguous `!` attention marker in this badge.
- Why smallest useful first pass: it removes false positives from unrelated discussions, preserves existing mention and acknowledgement truth, avoids a new notification/read model, and changes only the surfaces already showing the misleading signal.

## Bounded implementation plan

1. Backend aggregate:
   - Add personal discussion count case in `backend/app/storage.py`.
   - Extend `_notes_aggregate_payload`.
   - Keep existing `attention_discussions_count` for compatibility.
2. Frontend API/model:
   - Normalize `personal_discussions_count`.
   - Filter discussion notification inbox/history to current user's own attention threads.
3. Topbar:
   - Compute profile notification count from mention count + `personal_discussions_count`.
   - Keep aggregate discussion row honest as `Мои обсуждения`.
4. Session/explorer badge:
   - Change `NotesAggregateBadge` default label and aria text to open discussions count.
   - Remove misleading `!` display from this badge.
   - Rename legacy reports column title from `Заметки и отчёты` to `Отчёты`.
5. Version/changelog:
   - Bump `frontend/src/config/appVersion.js`.
   - Add short Russian changelog lines.
6. Validation:
   - `git diff --check`
   - targeted backend tests
   - targeted frontend tests
   - `npm run build`
   - no unrelated tracked drift

## Implementation result

- Added `personal_discussions_count` / `has_personal_discussions` to the existing note aggregate read path.
- Topbar/profile signal now uses active mention count + personal discussion count.
- Personal discussion notification inbox/history is filtered to current user's own discussion threads.
- Session/explorer discussion badge now says `Обсуждения` and shows open discussion count only.
- Removed misleading `!` attention marker from the generic session discussion badge.
- Renamed the legacy explorer `reports_count` column title from `Заметки и отчёты` to `Отчёты`.
- Bumped app version to `v1.0.7` with two Russian changelog lines.

## Validation result

- `python -m py_compile backend/app/storage.py backend/app/routers/notes.py` passed.
- `node --test frontend/src/features/notes/discussionNotificationModel.test.mjs frontend/src/lib/api.noteThreads.test.mjs frontend/src/components/TopBar.discussion-notifications.test.mjs frontend/src/components/TopBar.header-meta.test.mjs frontend/src/components/NotesMvpPanel.discussions-surface-polish.test.mjs` passed: 20/20.
- `PYTHONPATH=backend python -m unittest backend.tests.test_notes_mvp1_api backend.tests.test_notes_mvp1_aggregation_api` passed: 9/9.
- `git diff --check` passed.
- `npm ci` completed; npm reported existing audit findings: 4 moderate, 3 high.
- `npm run build` passed; Vite reported existing large chunk warnings.
- Stage/runtime deploy proof was not run in this pass.

## Merge gate

- Review remains mandatory before merge.
- No merge was performed.
- No prod deploy was performed.
