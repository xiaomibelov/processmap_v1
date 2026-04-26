# discussions-create-flow-entity-form-v1

Status: frozen before bounded execution.

## Runtime/source truth

- Canonical checkout is dirty and must not be edited.
- Clean worktree: `/Users/mac/PycharmProjects/processmap_canonical_main/.worktrees/discussions_create_flow_entity_form_v1`
- Branch: `uiux/discussions-create-flow-entity-form-v1`
- Base: `origin/main` at `dc1107b18f311a19f1e19d56d96e48426a6017e0`.
- Formal GSD SDK phase artifacts are unavailable: `.planning/ROADMAP.md` is absent and `gsd-sdk query init.phase-op`, `init.plan-phase`, and `init.execute-phase` all returned `phase_found=false`, `planning_exists=false`.
- GSD gates used manually: discuss/source map -> frozen design decisions -> frozen execution boundary -> bounded implementation plan.

## Source map

### Create discussion UI owner

- `+ Новое обсуждение` button: `frontend/src/components/NotesMvpPanel.jsx`.
- Create form surface: `NotesMvpPanel.jsx`, gated by `createOpen`.
- Current body textarea: `createDraftByScope` / `createDraft`.
- Context selector/display: `createScope`, `createScopeOptions`, `buildScopeRef`.
- Priority control: `createPriority`, `PRIORITY_OPTIONS`, `data-testid="notes-create-priority"`.
- Attention control: `createRequiresAttention`, `data-testid="notes-create-attention"`.
- Mention picker: `mentionableUsers`, `createMentionUserId`, `data-testid="notes-create-mention-user"`.
- Submit action: `createThread()`.

### Backend/API create seam

- Create request schema: `CreateNoteThreadBody` in `backend/app/routers/notes.py`.
- Create route: `create_session_note_thread()`.
- Storage write: `storage.create_note_thread()` in `backend/app/storage.py`.
- Initial comment: `storage.create_note_thread()` inserts first row into `note_comments`.
- Priority payload: `priority`.
- Attention payload: `requires_attention`.
- Mentions payload: `mention_user_ids`, resolved to real users by `_resolve_mention_targets()`, persisted on the initial comment.
- Scope/context payload: `scope_type` and `scope_ref`.

### Existing source truth

- Title field exists: no separate persisted title field on `note_threads`.
- Initial message exists: yes, `CreateNoteThreadBody.body` creates the initial comment.
- Priority create support exists: yes.
- `requires_attention` create support exists: yes.
- Mentions on create support exists: yes, real-user IDs only.
- Context/scope create support exists: yes.

## Frozen design decisions

### Create form contract

Field order:

1. `Суть вопроса` - required subject/title-like first line.
2. `Контекст` - existing bounded context select plus clear current-context copy.
3. `Приоритет`.
4. `Требует внимания`.
5. `Упомянуть`.
6. `Описание` - optional details/initial message body.

Since no backend title field exists, the subject is stored as the first line of the initial comment body. Optional description is appended after a blank line. This preserves single truth and avoids schema expansion.

### Russian copy contract

- Form title: `Новое обсуждение`.
- Subject label: `Суть вопроса`.
- Subject placeholder: `Коротко сформулируйте вопрос`.
- Context label: `Контекст`.
- Priority label: `Приоритет`.
- Attention label: `Требует внимания`.
- Attention helper: `Подсветить как требующее реакции`.
- Mention label: `Упомянуть`.
- Mention empty option: `Без упоминания`.
- Details label: `Описание`.
- Details placeholder: `Добавьте детали, факты или ожидаемое решение`.
- Submit button: `Создать обсуждение`.

### Context contract

- `session`: show `Общий вопрос`.
- `diagram`: show `Диаграмма`.
- `diagram_element`: show `Элемент: {selectedElementName || selectedElementId}` when available.
- If no element is selected, element scope stays disabled and the form says to select a BPMN element.
- No invented element metadata.

### Mention contract

- Real users only from existing `mentionableUsers`.
- No free-text fake mentions.
- Create mentions attach to the initial comment through `mention_user_ids`.

### Out of scope

- Notification redesign.
- Inbox/history redesign.
- Personal signal semantics.
- Explorer/session badges.
- Unread/read.
- Assignments.
- Watcher/subscriber model.
- Backend schema expansion.

## Frozen execution boundary

- Required fields supported already or not: all required persistence fields are supported except separate persisted title; title is represented by first line of existing initial comment body.
- Minimal backend/API seam if needed: none.
- Minimal frontend surface: `NotesMvpPanel.jsx` create form only.
- Tests to update: `NotesMvpPanel.discussions-surface-polish.test.mjs`; API/backend tests remain targeted regression checks because payload shape stays the same.
- Why bounded: no new storage/API semantics, no notification or panel redesign, only create form hierarchy/copy and body composition.

## Bounded implementation plan

1. Add separate create subject/details state in `NotesMvpPanel.jsx`.
2. Compose create payload body as `subject + "\\n\\n" + details` when details are present.
3. Reorder create form fields and update Russian labels/placeholders.
4. Keep existing context, priority, attention, mention payloads unchanged.
5. Bump `frontend/src/config/appVersion.js`.
6. Update targeted source-contract tests.
7. Validate with `git diff --check`, targeted frontend/API/backend tests, and `npm run build`.

## Implementation result

- Split create flow into `Суть вопроса` subject and optional `Описание`.
- Kept backend payload unchanged: initial comment `body` is subject plus optional blank-line-separated details.
- Reordered form to entity-style hierarchy: subject, context, priority/attention, mention, description.
- Kept existing context, priority, attention, and mention semantics untouched.
- Bumped app version to `v1.0.8`.

## Validation result

- `node --test frontend/src/components/NotesMvpPanel.discussions-surface-polish.test.mjs frontend/src/lib/api.noteThreads.test.mjs` passed: 13/13.
- `PYTHONPATH=backend python -m unittest backend.tests.test_notes_mvp1_api` passed: 5/5.
- `git diff --check` passed.
- `npm ci` completed; npm reported existing audit findings: 4 moderate, 3 high.
- `npm run build` passed; Vite reported existing large chunk warning.
- Stage/runtime proof was not run in this pass.

## Merge gate

- Review remains mandatory before merge.
- No merge was performed.
- No prod deploy was performed.
