# PR — fix/subprocess-navigate-owner-scope

## Проблема

Navigate в подпроцесс пользователем, не являющимся владельцем child-сессии, падал с 500 (`PermissionError: session belongs to another user`). То же — при reimport parent (`auto_create_subprocess_sessions`) актором, не владеющим существующим child.

## Root cause

Доменный guard в `SessionStorage.save()` (`backend/app/storage.py` ~4503):

```python
if existing and not admin and owner_scope and existing_owner and existing_owner != owner_scope:
    raise PermissionError("session belongs to another user")
```

Системная синхронизация child-сессии (refresh XML из parent-фрагмента / heal title+navigation_stack / reimport parent) вызывала `session_repo.save(child, user_id=<uid актора>)`. При чужом непустом `owner_user_id` и не-админе guard делал raise. Синхронизация — системная операция от имени владельца child, а не актора-триггера; scope актора здесь неуместен.

## Решение

1. **`backend/app/services/session_service.py`** — новый helper `_child_sync_scope(child, uid, oid, admin)`: если у child есть владелец, отличный от актора, и актор не админ — запись выполняется под scope владельца (`owner, oid, False`); иначе поведение прежнее. Применён во всех save-точках синхронизации child:
   - navigate refresh-save (~1504),
   - navigate heal-save (~1532),
   - `auto_create_subprocess_sessions`: refresh-save существующего child (~1274, ~1279) и свежесозданного (~1295, для единообразия).
2. **Атрибуция snapshot**: navigate-точка `_refresh_child_session_bpmn_from_xml` теперь получает `created_by=uid, org_id=oid` — запись `bpmn_versions` (source_action=`subprocess_sync`) атрибутируется актору-триггеру; строка сессии при этом пишется под scope владельца (`updated_by` = владелец) — осознанная семантика «пишет система от имени владельца».
3. **Телеметрия** (`backend/app/error_events/schema.py`, `build_backend_exception_event`): в `context_json` для `OSError` добавлены `os_errno`, `os_filename`, `os_filename2` (None-safe, до редакции секретов). Строка `message` события не меняется — группировка/fingerprint по типу исключения сохраняются.
   - **Отклонение от плана §2.4**: поле `exception_message: str(exc)` НЕ добавлено. Существующий контракт `test_backend_exception_telemetry` доказывает, что текст исключения может содержать секреты (probe `RuntimeError("... secret_token_should_not_leak")`) и не должен персиститься; `redact_context_json` редактирует только по ключам, не по значениям, value-based scrubber в кодовой базе отсутствует. Персист raw-текста исключения сломал бы security-инвариант.

## Что НЕ меняется (ограничения контура)

- Read-access модель (org-wide read) — как раньше.
- Navigate не становится read-only.
- Legacy child без владельца — поведение как раньше (guard не триггерится пустым scope).
- Owner-модель child не пересматривается.

## Тесты

Новый `backend/tests/test_subprocess_navigate_owner_scope.py` (9 тестов):

1. Регрессия инцидента: не-админ B (та же org) navigate в child владельца A с расходящимся XML → 200, XML синхронизирован, `owner_user_id`=A, `updated_by`=A.
2. Админ-navigate → запись под админом (как раньше).
3. Владелец-navigate → как раньше.
4. Snapshot sync: `bpmn_versions.source_action="subprocess_sync"`, `created_by` = uid навигатора B.
5. `auto_create_subprocess_sessions`: reimport parent актором B, существующий child владельца A → без PermissionError, child обновлён.
6. Heal: старый title child владельца A → navigate от B → title/stack обновлены.
7. Совместимость preserve-DI: ручной DI child сохраняется при sync не-владельцем, новые элементы — в grid-зоне.
8. Телеметрия: `OSError` → `os_errno/os_filename/os_filename2` в `context_json`; `message` события неизменен; no-leak контракт (raw-текст исключения с секретным маркером не персистится) сохранён.

TDD: RED-коммит `7863b42c` (7 failed / 2 passed, причина — `PermissionError` из `storage.py:4503`), fix-коммиты `903df9c2` + `8b87b96f` (9/9 новых тестов зелёные).

## Риски

- `updated_by` = владелец при действии навигатора — осознанная семантика системной записи (зафиксировано выше).
- Гипотетический child с owner из другой org: org-guard (второй raise) срабатывает как раньше — поведение не менялось.
