# fix/workspace-explorer-remaining — PLAN-FIX

Цель: закрыть дефекты A2 → A1 → A5 → A4 → A3 без регресса WorkspaceExplorer.

## 1. Backend assignees 500

- Добавить failing backend test на Postgres compat path:
  - `PUT /api/sessions/{id}/assignees {"user_ids":["u1","u2"]}` → 200.
  - `GET /api/sessions/{id}/assignees` → два пользователя.
  - `PUT []` → 200 и пустой список.
- Исправить root cause:
  - предпочтительно добавить `_PgCompatConnection.executemany`;
  - либо заменить `con.executemany` в `_replace_session_assignees` на loop `con.execute`.
- Проверить, что SQLite path не сломан.

## 2. Assignment without explorer reset

- Добавить frontend test: раскрыть ветку третьего уровня, задать scrollTop, сохранить назначение, проверить:
  - expanded state не меняется;
  - loaded children cache не очищается;
  - scrollTop остаётся прежним;
  - search/filter остаются прежними;
  - меняется только target row.
- Для session-assignees оставить точечный optimistic update, расширить проверку rollback.
- Для folder responsible/project executor заменить `load({ resetInlineChildren: true })` на точечный patch строки.

## 3. Tree state persistence contract

- Зафиксировать целевой контракт: user + org + workspace expanded ids.
- Добавить migration/compat для legacy `explorer.tree.collapsed`.
- Убрать неоднозначность naming в коде или изолировать legacy-key adapter.
- Добавить тесты:
  - reload восстанавливает последнее состояние;
  - мутация до debounce flush не сворачивает дерево;
  - org/workspace не протекают друг в друга.

## 4. Workspace toast

- Вынести `moveNotice` в fixed toast viewport по паттерну `ProcessToastViewport` / `AppUpdateBanner`.
- Auto-dismiss success через 3-5s.
- `role="status" aria-live="polite"`.
- Source/UI test: toast не стоит между header и table.

## 5. Header IA and search icon

- Разделить global header и workspace toolbar:
  - global: org-level navigation, tabs, account, notifications;
  - workspace toolbar: search, create section/project, filters/sort.
- Search glyph `⌕` заменить на icon component из существующего набора проекта.
- Проверить responsive 1280/1920: toolbar не ломает sidebar/content join.

## 6. Verification

- Unit/contract tests:
  - backend assignees non-empty/empty;
  - frontend optimistic update + rollback;
  - state persistence/reload;
  - toast no-layout-shift source/UI contract;
  - composition units.
- Stage smoke:
  - назначить двух исполнителей, reload, оба видны;
  - снять одного, reload, оставшийся виден;
  - simulated API error → rollback;
  - assignment на третьем уровне вложенности не двигает screen;
  - screenshots before/after save at 1280 and 1920 with debug-grid (overlay не коммитить).
