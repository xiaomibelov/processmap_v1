# EXEC_REPORT — fix/subprocess-navigate-owner-scope

- **Дата**: 2026-08-20
- **Исполнитель**: Agent 2 (Executor), Kimi CLI subagent
- **Ветка**: `fix/subprocess-navigate-owner-scope` (worktree `p0-work-worktrees/fix-subprocess-navigate-owner-scope`, от `origin/main` = `06f519d5`)
- **HEAD**: docs-коммит артефактов (последний коммит ветки); code HEAD — `8b87b96f` (3 коммита: RED → fix → telemetry-correction)

## 1. Что сделано

1. **`backend/app/services/session_service.py`**
   - Новый helper `_child_sync_scope(child, uid, oid, admin)` (рядом с `_refresh_child_session_bpmn_from_xml`): если у child непустой `owner_user_id`, отличный от актора, и актор не админ — системная запись идёт под scope владельца `(owner, oid, False)`; иначе прежний scope `(uid, oid, admin)`.
   - Применён во всех save-точках синхронизации child:
     - navigate refresh-save (бывш. ~1504) + navigate heal-save (бывш. ~1532);
     - `auto_create_subprocess_sessions`: restore-save и refresh-save существующего child (бывш. ~1274, ~1279), refresh-save свежесозданного child (бывш. ~1295, для единообразия).
   - Navigate refresh теперь передаёт `created_by=uid, org_id=oid` в `_refresh_child_session_bpmn_from_xml` — snapshot `bpmn_versions` (source_action=`subprocess_sync`) атрибутируется актору-триггеру.
2. **`backend/app/error_events/schema.py`** (`build_backend_exception_event`)
   - В `context_json` (до `redact_context_json`) для `OSError` добавлены `os_errno`, `os_filename`, `os_filename2` (None-safe через getattr).
   - `message` события не изменён — группировка/fingerprint по типу сохранены.
   - **Отклонение от плана §2.4**: `exception_message: str(exc)` НЕ добавлено — см. §4.
3. **`backend/tests/test_subprocess_navigate_owner_scope.py`** (новый, 9 тестов) — регрессия инцидента, админ/владелец как раньше, атрибуция snapshot, auto_create reimport чужим актором, heal title/stack, preserve-DI совместимость, телеметрия (OSError-поля + no-leak контракт).

## 2. TDD-доказательства

### RED (коммит `7863b42c`, на чистом коде origin/main)

```
FAILED tests/test_subprocess_navigate_owner_scope.py::test_non_owner_navigate_syncs_child_under_owner_scope
FAILED tests/test_subprocess_navigate_owner_scope.py::test_sync_snapshot_attributed_to_navigating_actor
FAILED tests/test_subprocess_navigate_owner_scope.py::test_auto_create_syncs_existing_child_of_other_owner
FAILED tests/test_subprocess_navigate_owner_scope.py::test_non_owner_navigate_heals_child_title_and_stack
FAILED tests/test_subprocess_navigate_owner_scope.py::test_non_owner_sync_preserves_manual_di_layout
FAILED tests/test_subprocess_navigate_owner_scope.py::test_backend_exception_event_includes_exception_message
FAILED tests/test_subprocess_navigate_owner_scope.py::test_backend_exception_event_includes_os_error_details
7 failed, 2 passed
```

Причина ключевых падений подтверждена: `PermissionError: session belongs to another user` (`app/storage.py:4503`) в тестах 1 и 5.

### GREEN (коммиты `903df9c2`, `8b87b96f`)

`tests/test_subprocess_navigate_owner_scope.py`: **9 passed**. Дополнительно прогнаны `test_backend_exception_telemetry.py` и `test_admin_llm_api.py::test_models_crud_and_default_guards` — 13 passed (совместно с новым файлом).

## 3. Полный прогон backend-тестов

Раннер: `python -m pytest tests -q -p no:cacheprovider` из `backend/` (pytest, маркер `contract` исключён дефолтом), интерпретатор — переиспользованный venv `p0-work-worktrees/feat-endpoint-regression-scanner/.venv` (python 3.11; доустановлен `zstandard` в user-site системного 3.11 — не используется этим venv).

| Прогон | Результат | Время |
|---|---|---|
| Baseline `origin/main` (06f519d5), detached worktree `_baseline-origin-main` | **40 failed, 1180 passed** | 40:13 |
| Fix-ветка, прогон 1 (HEAD `903df9c2`) | 42 failed, 1187 passed | 59:14 |
| Fix-ветка, финальный (HEAD `8b87b96f`) | **41 failed, 1188 passed** | 34:16 |

Сравнение failure-сетов (финальный fix vs baseline, `comm` по спискам FAILED):
- Все 40 baseline-падений присутствуют и в fix-прогоне — **pre-existing** (sku_bindings, overlay_cache, e2e_interview_diagram_xml, session_meta_endpoint, org_property_dictionary_api, migration_bootstrap_resilience, deepseek_retry, status_service, bpmn_save_rbac_scope, analytics_aggregator, table_exists_pg, storage_sqlite_scope, redis_cache_workspace_tldr, rag_api, llm_status_api, llm_feedback_api, diagram_revision_parity, bpmn_meta) — к контуру не относятся (env/infra/исторический долг origin/main).
- Промежуточная регрессия прогона 1 (`test_backend_exception_telemetry` ×2) — устранена коммитом `8b87b96f`, в финальном прогоне отсутствует.
- Единственное «лишнее» падение финального прогона — `test_audit_log_e8.py::test_param_change_writes_named_diff_within_1s` (timing-assert «within 1s»); изолированно **5 passed** — флаки под нагрузкой (в baseline-прогоне не падал, в прогоне 1 fix-ветки падал `test_admin_llm_api` — так же флаки: изолированно проходит).

Вывод: дельта падений к baseline = 0 устойчивых; изменения регрессий не вносят.

## 4. Отклонения от плана

- **§2.4, `exception_message`**: не реализовано. `test_backend_exception_telemetry` пинит security-инвариант: текст исключения может содержать секреты (probe `RuntimeError("... secret_token_should_not_leak")`) и не должен персиститься; `redact_context_json` редактирует только по ключам, value-based scrubber в кодовой базе отсутствует. Персист `str(exc)` ломал бы контракт (доказано падением 2 тестов в прогоне 1). Оставлены безопасные структурные поля `os_errno/os_filename/os_filename2`. Тест 8 переформулирован: проверяет OSError-поля, неизменный `message` и сохранение no-leak контракта.
- Остальные пункты плана выполнены без отклонений (helper, 4 save-точки, `created_by` в navigate).

## 5. Git-proof

```
branch: fix/subprocess-navigate-owner-scope (worktree p0-work-worktrees/fix-subprocess-navigate-owner-scope)
HEAD:   8b87b96fd786e8b95ec4d98340d882c71b816469
base:   origin/main = 06f519d5
status: ahead 3, чистое дерево

diffstat (origin/main...HEAD):
 backend/app/error_events/schema.py                 |  37 +--
 backend/app/services/session_service.py            |  29 ++-
 backend/tests/test_subprocess_navigate_owner_scope.py | 290 +++++++++++++++++++++
 3 files changed, 334 insertions(+), 22 deletions(-)
```

## 6. Риски и ограничения

- `updated_by` = владелец child при системной записи, инициированной навигатором — осознанная семантика «системная запись от имени владельца» (зафиксировано в PR.md).
- Legacy child без владельца — поведение как раньше (guard пустым scope не триггерится).
- Read-access модель и owner-модель не менялись; navigate не стал read-only.
- Baseline-падения origin/main (40) остаются — вне контура.
- Push/PR/merge/deploy не выполнялись (по ограничениям контура).
