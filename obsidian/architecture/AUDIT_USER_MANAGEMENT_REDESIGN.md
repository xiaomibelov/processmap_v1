# AUDIT: feat/user-management-redesign

**Branch:** `feat/user-management-redesign`
**Target:** `main` (`new-origin/main`, current HEAD)
**Mode:** read-only, no git mutations
**Date:** 2026-06-23T21:40:55Z

## Summary

Ветка содержит UX-редизайн страницы «Пользователи и доступ» (таблица + drawer + фильтры + матрица прав) и серию backend-изменений для хранения/применения `org_memberships.permissions`. Часть этой работы уже влита в `main` через ветку `feature/user-access-redesign` (контур `.planning/contours/feature/user-access-redesign`, статус `implemented`). Кроме того, `feat/user-management-redesign` включает subprocess-navigation коммиты, которые позже попали в `main` через отдельные PR (#390/#391), поэтому diff сильно раздут неуникальными изменениями.

Ветка отстаёт от `main` на 56 коммитов, имеет 47 собственных коммитов (последний — WIP «commit uncommitted worktree changes before rebase») и конфликтует минимум с 16 файлами. Учитывая, что целевой функционал уже в `main`, **рекомендуется discard**; если есть уникальные улучшения — вынести их в новый контур от актуального `main`.

## Commit History

Всего коммитов: 47. Автор: Kimi CLI. Даты: 2026-06-17 — 2026-06-22.

| SHA | Date | Message |
|-----|------|---------|
| 2d521f6a | 2026-06-22 | wip(feat/user-management-redesign): commit uncommitted worktree changes before rebase |
| ee778e6e | 2026-06-19 | feat(user-mgmt): refactor AdminUsersPanel to table + drawer composition |
| 602a7826 | 2026-06-19 | feat(user-mgmt): add UserDrawer component |
| bedf6617 | 2026-06-19 | feat(user-mgmt): add OrgPermissionBlock component |
| dd574fb4 | 2026-06-19 | feat(user-mgmt): add UserTable component |
| 1c04cfbd | 2026-06-19 | feat(user-mgmt): add UserFiltersBar component |
| 650c6f0f | 2026-06-19 | feat(user-mgmt): add UserAvatar component |
| 072793e3 | 2026-06-19 | test(user-mgmt): strengthen admin API URL encoding and permissions tests |
| 735dddd3 | 2026-06-19 | fix(user-mgmt): encode admin user filters in URL and add API tests |
| be082621 | 2026-06-19 | feat(user-mgmt): add frontend permission helpers |
| 12098969 | 2026-06-19 | feat(user-mgmt): pass filters and permissions through admin API |
| b8b4e7b3 | 2026-06-19 | test(user-mgmt): cover filters and custom permissions |
| 0befc686 | 2026-06-19 | test(user-mgmt): expand service-layer permission tests and fix imports |
| 9e75cf78 | 2026-06-19 | test(user-mgmt): add negative service tests and reconcile plan |
| aeee3e24 | 2026-06-19 | fix(user-mgmt): map can_manage_project_members to edit permission |
| af4d83cf | 2026-06-19 | docs(user-mgmt): align plan and cleanup_org_audit with conservative admin-only org actions |
| 8299ff74 | 2026-06-19 | fix(user-mgmt): align git-mirror and project-member guards with permission model |
| 03955aba | 2026-06-19 | fix(user-mgmt): keep org-level actions admin-only in permission model |
| 1adc6e74 | 2026-06-19 | feat(user-mgmt): enforce OrgPermissions in service layer |
| 9750027b | 2026-06-19 | feat(user-mgmt): add OrgPermissions authority object |

**Top commits (последние 20):**

| SHA | Date | Message |
|-----|------|---------|
| 2d521f6a | 2026-06-22 | wip(feat/user-management-redesign): commit uncommitted worktree changes before rebase |
| ee778e6e | 2026-06-19 | feat(user-mgmt): refactor AdminUsersPanel to table + drawer composition |
| 602a7826 | 2026-06-19 | feat(user-mgmt): add UserDrawer component |
| bedf6617 | 2026-06-19 | feat(user-mgmt): add OrgPermissionBlock component |
| dd574fb4 | 2026-06-19 | feat(user-mgmt): add UserTable component |
| 1c04cfbd | 2026-06-19 | feat(user-mgmt): add UserFiltersBar component |
| 650c6f0f | 2026-06-19 | feat(user-mgmt): add UserAvatar component |
| 072793e3 | 2026-06-19 | test(user-mgmt): strengthen admin API URL encoding and permissions tests |
| 735dddd3 | 2026-06-19 | fix(user-mgmt): encode admin user filters in URL and add API tests |
| be082621 | 2026-06-19 | feat(user-mgmt): add frontend permission helpers |
| 12098969 | 2026-06-19 | feat(user-mgmt): pass filters and permissions through admin API |
| b8b4e7b3 | 2026-06-19 | test(user-mgmt): cover filters and custom permissions |
| 0befc686 | 2026-06-19 | test(user-mgmt): expand service-layer permission tests and fix imports |
| 9e75cf78 | 2026-06-19 | test(user-mgmt): add negative service tests and reconcile plan |
| aeee3e24 | 2026-06-19 | fix(user-mgmt): map can_manage_project_members to edit permission |
| af4d83cf | 2026-06-19 | docs(user-mgmt): align plan and cleanup_org_audit with conservative admin-only org actions |
| 8299ff74 | 2026-06-19 | fix(user-mgmt): align git-mirror and project-member guards with permission model |
| 03955aba | 2026-06-19 | fix(user-mgmt): keep org-level actions admin-only in permission model |
| 1adc6e74 | 2026-06-19 | feat(user-mgmt): enforce OrgPermissions in service layer |
| 9750027b | 2026-06-19 | feat(user-mgmt): add OrgPermissions authority object |

**Merge-коммиты:** отсутствуют (linear history).

## Files Changed

| File | Insertions | Deletions | Type |
|------|------------|-----------|------|
| .gitignore | 4 | 0 | other |
| backend/app/routers/admin.py | 42 | 9 | backend router |
| backend/app/routers/notes.py | 2 | 0 | backend router |
| backend/app/services/bpmn_navigation.py | 242 | 22 | backend service |
| backend/app/services/org_service.py | 35 | 32 | backend service |
| backend/app/services/org_workspace.py | 14 | 23 | backend service |
| backend/app/services/session_service.py | 5 | 1 | backend service |
| backend/app/storage.py | 173 | 16 | backend storage |
| backend/app/utils/authz.py | 86 | 3 | backend util |
| backend/app/utils/org_permission_constants.py | 27 | 0 | backend util |
| backend/tests/test_admin_user_management_api.py | 280 | 0 | backend test |
| backend/tests/test_bpmn_navigation_helpers.py | 114 | 0 | backend test |
| backend/tests/test_org_permissions.py | 176 | 0 | backend test |
| backend/tests/test_org_service.py | 260 | 0 | backend test |
| backend/tests/test_subprocess_navigation.py | 1 | 0 | backend test |
| docs/superpowers/plans/2026-06-19-user-management-redesign-plan.md | 1865 | 0 | docs |
| docs/superpowers/specs/2026-06-19-user-management-redesign-design.md | 275 | 0 | docs |
| frontend/Dockerfile.prod | 2 | 0 | other |
| frontend/e2e/admin-orgs-users-invites-cleanup.spec.mjs | 69 | 14 | frontend e2e |
| frontend/e2e/discussion-focus-no-drilldown.spec.mjs | 232 | 0 | frontend e2e |
| frontend/e2e/helpers/e2eAuth.mjs | 3 | 1 | frontend e2e |
| frontend/e2e/helpers/processFixture.mjs | 5 | 1 | frontend e2e |
| frontend/e2e/notes-panel-icons.spec.mjs | 104 | 0 | frontend e2e |
| frontend/e2e/notes-thread-actions-dropdown.spec.mjs | 135 | 0 | frontend e2e |
| frontend/e2e/subprocess-expanded-shape.spec.mjs | 259 | 0 | frontend e2e |
| frontend/e2e/subprocess-navigation.spec.mjs | 264 | 0 | frontend e2e |
| frontend/package.json | 1 | 0 | other |
| frontend/scripts/generate-build-info.mjs | 7 | 9 | other |
| frontend/src/App.jsx | 72 | 19 | other |
| frontend/src/app/sessionRouteOrchestration.test.mjs | 11 | 17 | other |
| frontend/src/app/useSessionRouteOrchestration.js | 12 | 13 | other |
| frontend/src/components/AppShell.jsx | 6 | 10 | frontend component |
| frontend/src/components/NotesMvpPanel.discussions-surface-polish.test.mjs | 15 | 10 | frontend component |
| frontend/src/components/NotesMvpPanel.icons.css | 120 | 0 | frontend component |
| frontend/src/components/NotesMvpPanel.jsx | 643 | 156 | frontend component |
| frontend/src/components/ProcessStage.jsx | 90 | 5 | frontend component |
| frontend/src/components/process/BpmnStage.jsx | 68 | 4 | frontend component |
| frontend/src/features/admin/adminRoles.js | 24 | 0 | frontend admin |
| frontend/src/features/admin/adminRoles.test.mjs | 13 | 0 | frontend admin |
| frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx | 125 | 391 | frontend admin |
| frontend/src/features/admin/components/orgs/AdminUsersPanel.profile-fields.test.mjs | 24 | 39 | frontend admin |
| frontend/src/features/admin/components/users/OrgPermissionBlock.jsx | 87 | 0 | frontend admin |
| frontend/src/features/admin/components/users/UserAvatar.jsx | 41 | 0 | frontend admin |
| frontend/src/features/admin/components/users/UserDrawer.jsx | 143 | 0 | frontend admin |
| frontend/src/features/admin/components/users/UserFiltersBar.jsx | 62 | 0 | frontend admin |
| frontend/src/features/admin/components/users/UserTable.jsx | 93 | 0 | frontend admin |
| frontend/src/features/notes/markdownRenderer.js | 23 | 1 | other |
| frontend/src/features/notes/markdownRenderer.test.mjs | 5 | 0 | other |
| frontend/src/features/process/SubprocessBreadcrumbs.jsx | 5 | 1 | frontend process |
| frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js | 4 | 3 | frontend process |
| frontend/src/features/process/bpmn/stage/decor/decorManager.js | 134 | 1 | frontend process |
| frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js | 97 | 0 | frontend process |
| frontend/src/features/process/bpmn/stage/load/DiagramLoadBoundary.jsx | 1 | 5 | frontend process |
| frontend/src/features/process/bpmn/stage/load/useDeferredDecorFanout.js | 20 | 0 | frontend process |
| frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js | 6 | 0 | frontend process |
| frontend/src/features/process/bpmn/stage/orchestration/runBpmnRenderDecorSync.js | 2 | 0 | frontend process |
| frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js | 4 | 0 | frontend process |
| frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css | 2 | 2 | frontend process |
| frontend/src/features/process/bpmn/stage/viewport/viewportRecovery.js | 4 | 0 | frontend process |
| frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js | 10 | 1 | frontend process |
| frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js | 2 | 0 | frontend process |
| frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js | 1 | 0 | frontend process |
| frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx | 3 | 3 | frontend process |
| frontend/src/lib/api.admin-users.test.mjs | 154 | 0 | frontend lib |
| frontend/src/lib/api.js | 2 | 2 | frontend lib |
| frontend/src/lib/apiModules/adminApi.js | 5 | 2 | frontend lib |
| frontend/src/lib/apiRoutes.js | 1 | 1 | frontend lib |
| frontend/src/lib/sessionNoteAggregates.js | 157 | 49 | frontend lib |
| frontend/src/lib/sessionNoteAggregates.test.mjs | 42 | 15 | frontend lib |
| scripts/e2e/check_subprocess_click.mjs | 81 | 6 | other |
| vault/decisions/2026-06-17-bpmn-drilldown-ui.md | 42 | 0 | docs |

**Total:** 71 files, ~7138 insertions, ~887 deletions.

## API / UI Changes

### Backend API
- `GET /api/admin/users` — добавлены query-параметры `q`, `role`, `status`; данные берутся из `list_auth_users_filtered`.
- `POST/PATCH /api/admin/users` — membership payload теперь принимает `permissions` (список флагов).
- `backend/app/storage.py` — новые helpers `list_auth_users_filtered`, `_normalize_org_membership_permissions`.
- `backend/app/utils/org_permission_constants.py` — новый файл с константами прав.
- `backend/app/utils/authz.py` — изменения для учёта permissions в авторизации.

### Frontend UI
- `AdminUsersPanel.jsx` — полный редизайн: таблица вместо inline-формы, drawer для создания/редактирования.
- Новые компоненты: `UserTable`, `UserDrawer`, `UserFiltersBar`, `UserAvatar`, `OrgPermissionBlock`.
- `frontend/src/features/admin/adminRoles.js` — helpers ролей/прав.
- `frontend/src/lib/apiModules/adminApi.js` — прокидывание filters/permissions.

### Пересечение с subprocess navigation
Ветка также содержит коммиты по subprocess navigation (breadcrumbs, child discussion badges, DI generation, e2e-тесты). Эти изменения уже в `main` через `fix/bpmn-drilldown-ui` / `fix/sub-process-navigation`, поэтому в diff они мешают оценке уникальности ветки.

## Conflicts with main

При `git merge-tree main feat/user-management-redesign` зафиксированы конфликты в следующих файлах:

| File | Reason |
|------|--------|
| `backend/app/routers/admin.py` | admin users API + permissions filtering изменены в обеих ветках |
| `backend/app/storage.py` | membership permissions + filtered user listing |
| `backend/tests/test_admin_user_management_api.py` | тесты пересекаются с merged `feature/user-access-redesign` |
| `frontend/src/App.jsx` | subprocess navigation + route state changes |
| `frontend/src/components/AppShell.jsx` | breadcrumbs / subprocess props |
| `frontend/src/components/ProcessStage.jsx` | overlay-pan toggle + subprocess props |
| `frontend/src/components/process/BpmnStage.jsx` | subprocess navigation hooks |
| `frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx` | полностью переработан; уже есть merged версия |
| `frontend/src/features/admin/components/orgs/AdminUsersPanel.profile-fields.test.mjs` | тесты пересекаются |
| `frontend/src/features/admin/components/users/UserDrawer.jsx` | новый файл, но main имеет другую версию drawer |
| `frontend/src/features/process/SubprocessBreadcrumbs.jsx` | уже в main |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | уже в main |
| `frontend/src/features/process/bpmn/stage/load/DiagramLoadBoundary.jsx` | уже в main |
| `frontend/src/features/process/bpmn/stage/orchestration/runBpmnRenderDecorSync.js` | уже в main |
| `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css` | уже в main |
| `frontend/src/lib/apiModules/adminApi.js` | admin API changes |
| `frontend/src/lib/sessionNoteAggregates.js` | child session aggregates |

## Related Contour

- `.planning/contours/feature/user-access-redesign/` — статус `implemented`, ветка `feature/user-access-redesign` уже влита в `main` через squash/merge. Этот контур покрывает ту же цель (редизайн страницы пользователей и прав).

## Recommendation

**DISCARD** — не rebase, не merge.

Обоснование:
1. Основной целевой функционал (user-access redesign) уже в `main` через `feature/user-access-redesign`.
2. Ветка сильно отстала от `main` (drift 56) и имеет 16+ конфликтных файлов.
3. Последний коммит — WIP «commit uncommitted worktree changes before rebase», что указывает на незавершённое состояние.
4. Subprocess-navigation часть ветки уже в `main` и создаёт шум в diff.
5. Ручное разрешение конфликтов потребует пересечения с уже влитой логикой и рискует regressions.

**Если нужны какие-то уникальные улучшения из этой ветки** (например, более полные e2e-тесты или отдельные UI-детали), рекомендуется создать новый контур `feature/user-management-redesign-v2` от актуального `main` и перенести только нужные diff-куски, а не rebasing 47-коммитной ветки.
