# Enterprise Implementation Test Matrix

Цель матрицы: зафиксировать минимально достаточный набор проверок для безопасного внедрения org-scope, RBAC и dual-routing.

## 1) Общие фикстуры (для backend + frontend)

## 1.1 Users
- `u_owner_a` (editor/project manager in `org_a`)
- `u_owner_b` (editor/project manager in `org_b`)
- `u_viewer_a` (viewer in `org_a`)
- `u_admin_a` (org admin in `org_a`)
- `u_super_admin` (global admin, опционально)

## 1.2 Orgs/Projects/Sessions
- `org_a`, `org_b`
- `project_a1`, `project_b1`
- `session_a1`, `session_b1`
- минимум 1 report version на `session_a1/path=primary`

## 1.3 Tokens/context
- Access tokens с/без `active_org_id` claim
- Legacy token (без org claim) для fallback-пути `default_org_id`

---

## 2) Backend unit/integration matrix

| ID | Тип | Тест | Что доказывает | Нужные фикстуры | База/файл |
|---|---|---|---|---|---|
| BE-01 | Unit | `storage_scope_org_list` | list projects/sessions не утекает между `org_a` и `org_b` | users/orgs/projects/sessions | `backend/tests/test_storage_sqlite_scope.py` (расширить) |
| BE-02 | Unit | `storage_scope_org_load` | `load(project/session)` возвращает `None` для чужого org при non-admin | same | `test_storage_sqlite_scope.py` |
| BE-03 | Unit | `storage_scope_admin_cross_org` | org admin видит только свой org; super-admin видит все (если вводится) | memberships roles | новый `test_storage_org_policy.py` |
| BE-04 | Integration | `middleware_resolves_active_org_from_path` | `/api/orgs/{org_id}/...` кладёт `active_org_id` в scope | token + org path | новый `test_org_guard.py` |
| BE-05 | Integration | `middleware_resolves_active_org_from_header_legacy` | legacy путь принимает `X-Active-Org-Id` и корректно scope’ит | token + header | `test_org_guard.py` |
| BE-06 | Integration | `legacy_without_header_uses_default_org` | fallback `default_org_id(user)` стабилен на legacy endpoints | user with default org | `test_org_guard.py` |
| BE-07 | Integration | `policy_forbidden_returns_403` | write в чужом org -> 403 | viewer/editor mix | `test_org_policy_api.py` |
| BE-08 | Integration | `not_found_in_scope_returns_404` | чужой id в другом org маскируется как 404 scoped | cross-org ids | `test_org_policy_api.py` |
| BE-09 | Integration | `validation_returns_422` | невалидный payload на new route возвращает 422 contract | malformed payload | `test_org_policy_api.py` |
| BE-10 | Integration | `projects_crud_org_scoped` | create/get/patch/delete projects работают только в org scope | org fixtures | `test_projects_org_api.py` |
| BE-11 | Integration | `sessions_crud_org_scoped` | create/get/patch/delete sessions scoped и не ломают legacy | org fixtures | `test_sessions_org_api.py` |
| BE-12 | Integration | `reports_list_detail_delete_org_scoped` | reports не видны/неудаляемы cross-org | sessions + reports | расширить `backend/tests/test_path_report_api.py` |
| BE-13 | Integration | `export_scoped_access` | `/export` и `/export.zip` недоступны в чужом org | sessions in both orgs | новый `test_export_org_scope.py` |
| BE-14 | Migration | `backfill_default_org_id_idempotent` | повторный backfill не портит данные | legacy rows (`owner_user_id`) | новый `test_org_migration_backfill.py` |
| BE-15 | Unit | `auth_login_sets_active_org_claim` | access token содержит active org | multi-org user | расширить `backend/tests/test_auth_jwt_flow.py` |
| BE-16 | Contract | `legacy_endpoints_still_respond` | список legacy endpoint’ов доступен после enterprise rollout | smoke fixtures | новый `test_legacy_routes_compat.py` |

### Что использовать из существующих тестов как базу
- owner/admin scope: [test_storage_sqlite_scope.py](/Users/mac/PycharmProjects/foodproc_process_copilot/backend/tests/test_storage_sqlite_scope.py)
- auth issue/rotate/revoke: [test_auth_jwt_flow.py](/Users/mac/PycharmProjects/foodproc_process_copilot/backend/tests/test_auth_jwt_flow.py)
- reports lifecycle/delete: [test_path_report_api.py](/Users/mac/PycharmProjects/foodproc_process_copilot/backend/tests/test_path_report_api.py)

---

## 3) Frontend E2E matrix

| ID | Тип | Сценарий | Что доказывает | Фикстуры | База/файл |
|---|---|---|---|---|---|
| FE-01 | E2E | login -> org selector -> `/app` | org-switch обязателен после login | user with 2 org memberships | новый `frontend/e2e/org-routing-login.spec.mjs` |
| FE-02 | E2E | single-org auto select | пользователь с 1 org попадает сразу в workspace | user with 1 membership | `org-routing-login.spec.mjs` |
| FE-03 | E2E | switch org updates project list | при смене org обновляется topbar project/session list | org_a/org_b data | новый `org-switch-projects.spec.mjs` |
| FE-04 | E2E | viewer role hides destructive actions | viewer не видит/не может delete/rename | viewer token | новый `org-rbac-viewer-ui.spec.mjs` |
| FE-05 | E2E | editor role can edit session | editor может patch session/BPMN в своем org | editor token | новый `org-rbac-editor-ui.spec.mjs` |
| FE-06 | E2E | cross-org project direct URL denied | при попытке открыть чужой session показывается scoped 404/403 | session_b1 + user_a | новый `org-cross-scope-open-session.spec.mjs` |
| FE-07 | E2E | reports list scoped | reports panel видит только scoped версии | reports fixtures | расширить `frontend/e2e/reports-persistence-afbb.spec.mjs` |
| FE-08 | E2E | delete report scoped | удаление версии отчёта работает только в org scope | report fixture | новый `reports-delete-scoped.spec.mjs` |
| FE-09 | E2E | legacy UI path still works | существующий flow create project/session работает в dual-routing | legacy endpoints enabled | [create-project-and-session.spec.mjs](/Users/mac/PycharmProjects/foodproc_process_copilot/frontend/e2e/create-project-and-session.spec.mjs) |
| FE-10 | E2E | error contract rendering | UI корректно обрабатывает 401/403/404/422 с new contract | mocked API responses | новый `org-error-contract.spec.mjs` |

### Точки существующей E2E базы
- auth routing smoke: [auth-routing-login.spec.mjs](/Users/mac/PycharmProjects/foodproc_process_copilot/frontend/e2e/auth-routing-login.spec.mjs)
- create project/session: [create-project-and-session.spec.mjs](/Users/mac/PycharmProjects/foodproc_process_copilot/frontend/e2e/create-project-and-session.spec.mjs)
- reports persistence flow: [reports-persistence-afbb.spec.mjs](/Users/mac/PycharmProjects/foodproc_process_copilot/frontend/e2e/reports-persistence-afbb.spec.mjs)
- auth helper/token injection: [e2eAuth.mjs](/Users/mac/PycharmProjects/foodproc_process_copilot/frontend/e2e/helpers/e2eAuth.mjs)

---

## 4) Минимальный rollout gating (обязательные зелёные проверки)

1. `BE-01`, `BE-04`, `BE-07`, `BE-10`, `BE-12`, `BE-14`, `BE-16`
2. `FE-01`, `FE-03`, `FE-04`, `FE-07`, `FE-09`

Без прохождения этого набора не переводить enterprise flag в default-on.

---

## 5) Риски тестового контура

1. Текущие e2e массово завязаны на legacy `/api/projects` и `/api/sessions`; dual-routing требует явного режима compat.
2. Для cross-org тестов нужны детерминированные фикстуры memberships и clear reset между тестами.
3. Contract drift (200 + `{error}` vs HTTP errors) должен покрываться отдельными тестами адаптера `frontend/src/lib/api.js`.
