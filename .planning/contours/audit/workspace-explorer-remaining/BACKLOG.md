# audit/workspace-explorer-remaining — BACKLOG

1. Blocker — A2 assignees API 500 on non-empty `user_ids`.
   - Fix `_PgCompatConnection.executemany` or replace repository `executemany` with portable `execute` loop.
   - Add contract test: `PUT ["u1","u2"]` returns 200 and `GET` returns both users.

2. Major — A1/A5 tree state loss around mutations.
   - Remove `load({ resetInlineChildren: true })` from assignment flows.
   - Patch only affected row; preserve `expandedByFolder`, loaded children cache, scroll, filters and search.

3. Major — A5 preference contract ambiguity.
   - Migrate/document `explorer.tree.collapsed` as legacy expanded-id list.
   - Scope persisted state by user + org + workspace.
   - Cover debounce/refetch race with tests.

4. Major — A4 success notice layout shift.
   - Replace in-flow `moveNotice` with fixed toast viewport.
   - Add auto-dismiss and `role="status" aria-live="polite"`.

5. Major — A3 header information architecture.
   - Move workspace actions to workspace toolbar.
   - Keep global header for org/global navigation.
   - Replace `⌕` glyph with project icon component.

6. Minor — B4 auth bootstrap console noise.
   - Suppress expected missing-refresh bootstrap path or avoid calling refresh when token is absent.

7. Minor — B1 regression guard.
   - Add Playwright debug-grid visual checklist for 1280/1920 after fixes.

8. Minor — B2 metric semantics.
   - If product requires subprocess progress, change backend fields and API docs.
   - If sessions are correct, update UX copy/tooltips to say “активные сессии” consistently.
