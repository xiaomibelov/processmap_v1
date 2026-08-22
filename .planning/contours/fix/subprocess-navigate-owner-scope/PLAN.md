# PLAN — fix/subprocess-navigate-owner-scope

- **Контур**: `fix/subprocess-navigate-owner-scope`
- **Ветка**: `fix/subprocess-navigate-owner-scope` от свежего `origin/main` (06f519d5; зависимость `fix/subprocess-preserve-di-on-sync` — **смержена**, PR #762, merge 4d7550df)
- **Источник**: audit `navigate-subprocess-permission-error` (REPORT.md, 2026-08-20)
- **RAG preflight**: недоступен (`invalid_user` на localhost:8011) — зафиксировано; контекст прочитан вручную (REPORT аудита, subprocess-layout-corruption/AUDIT.md, код origin/main).

## 1. Механика (подтверждено по origin/main)

Guard в `SessionStorage.save()` (`backend/app/storage.py`, в `save()` ~4500):
```python
if existing and not admin and owner_scope and existing_owner and existing_owner != owner_scope:
    raise PermissionError("session belongs to another user")
```
Ключевое свойство guard'а: **пустой `owner_scope` guard не триггерит**; несовпадение с непустым владельцем — raise. Запись `owner = existing_owner or owner_scope` — владелец при системной записи не перетирается.

Точки падения (все — системная синхронизация child, выполняемая под `user_id` чужого актора):
1. `session_service.py:1504` — navigate: refresh-save после `_refresh_child_session_bpmn_from_xml` (сценарий инцидента).
2. `session_service.py:1532` — navigate: heal-save (title / navigation_stack).
3. `session_service.py:1274, 1279` — `auto_create_subprocess_sessions`: refresh-save существующего child при импорте/reimport parent.
4. `session_service.py:1295` — refresh-save свежесозданного child (owner = создатель → guard не сработает; для единообразия — тот же helper).

`storage.py:4711/4787` (из blast radius аудита) — это raise внутри `save()` на путях `bpmn_snapshot`-вставки и `update`-метода с тем же guard'ом; отдельных правок не требуют — закрываются тем, что вызывающий код передаёт корректный scope.

## 2. Изменения

### 2.1 Helper системного scope (session_service.py)
```python
def _child_sync_scope(child: Session, uid: str, oid: str, admin: bool):
    """Scope для системной синхронизации child-сессии.

    Синхронизация (refresh XML / heal title+stack / reimport) — системная
    операция от имени ВЛАДЕЛЬЦА child, а не актора, её вызвавшего.
    Guard SessionStorage.save() требует owner_scope == existing_owner.
    """
    owner = str(getattr(child, "owner_user_id", "") or "").strip()
    if owner and owner != uid and not admin:
        return owner, oid, False  # системная запись под scope владельца
    return uid, oid, admin        # владелец/админ/legacy-без-владельца: как раньше
```
Применить во всех 4 точках: `session_repo.save(child, user_id=s_uid, org_id=s_oid, is_admin=s_admin)` где `(s_uid, s_oid, s_admin) = _child_sync_scope(child, uid, oid, admin)`.

### 2.2 Поведение при legacy-данных (child без владельца)
`existing_owner == ""` → guard не срабатывает при любом scope → ветка `else` (текущее поведение, включая исторический claim `owner = owner_scope` навигатора). Намеренно сохраняем: смена owner-модели для legacy — вне контура.

### 2.3 Атрибуция bpmn_versions
- `source_action="subprocess_sync"` уже ставится `_snapshot_child_bpmn` (fix preserve-di) — не меняем.
- `created_by`: в navigate-точке (1502) `_refresh_child_session_bpmn_from_xml` сейчас вызывается **без** `created_by` (snapshot уходит с пустым user_id). Передаём `created_by=uid` — конвенция консистентна с `session_service.py:1293` (auto_create: `created_by=uid` актора). Snapshot — запись о действии, инициированном актором; строка сессии при этом пишется под scope владельца (`updated_by` = владелец), что корректно отражает «пишет система от имени владельца».
- **Решение (зафиксировано)**: `bpmn_versions.created_by` = uid актора-триггера; `sessions.updated_by` = владелец child (через owner-scope). System-user не вводим — в схеме нет такой конвенции.

### 2.4 Микро-fix телеметрии (отдельным коммитом в той же ветке)
`backend/app/error_events/schema.py` `build_backend_exception_event` (~407-420):
- В `context_json` добавить `exception_message: str(exc)` (до `redact_context_json`, чтобы работала редакция секретов).
- Для `isinstance(exc, OSError)`: `os_errno`, `os_filename`, `os_filename2`.
- `message` оставить как есть (тип) — детали в context_json; не ломаем группировку/fingerprint (fingerprint считается от event — проверить, что fingerprint не включает новые поля неконсистентно; если включает context — допустимо, поля детерминированы).

## 3. Что НЕ делаем (ограничения контура)
- Read-access модель (org-wide read) не меняется.
- Navigate не становится read-only; перенос sync на save parent — future-контур.
- Owner-модель child (owner = первый создатель) не пересматривается.

## 4. Тесты (backend/tests/, TDD: RED → GREEN)
Новый файл `test_subprocess_navigate_owner_scope.py` + дополнения в `test_auto_create_subprocess_sessions.py`:
1. **Регрессия инцидента**: не-админ B (та же org) navigate в child владельца A с расходящимся XML → 200, `bpmn_xml` child синхронизирован, `sessions.owner_user_id` не изменился (=A), `updated_by` = A.
2. Админ-navigate → 200, запись под админом (как раньше).
3. Владелец-navigate → 200 (как раньше).
4. Snapshot sync: запись `bpmn_versions` имеет `source_action="subprocess_sync"`, `created_by` = uid навигатора B.
5. `auto_create_subprocess_sessions` (reimport parent актором B, child владельца A с изменённым fragment) → не 500, child обновлён.
6. Heal-save: child владельца A со старым title → navigate от B → 200, title обновлён.
7. Совместимость preserve-DI: у child владельца A ручной DI → navigate от B с changed fragment → DI сохранён (preserve_existing_di сработал), новые элементы в grid-зоне.
8. Middleware: `PermissionError("session belongs to another user")` → context_json содержит `exception_message`; `OSError(errno=13, filename=...)` → `os_errno/os_filename`.

## 5. Шаги
1. `git worktree`/ветка `fix/subprocess-navigate-owner-scope` от `origin/main` (в p0-work).
2. RED: тесты 1, 5, 8 падают на текущем коде.
3. GREEN: helper + 4 точки + created_by; middleware-поля.
4. Полный прогон backend-тестов локально.
5. EXEC_REPORT.md, PR.md (на русском), mirror в Obsidian. Push + PR — после approve; merge/deploy — только по явному решению.

## 6. Риски
- `updated_by` владельца при действии навигатора — осознанная семантика «системная запись»; зафиксировано в PR.
- Если у child owner не совпадает с org навигатора (гипотетика) — org-guard (второй raise) сработает как раньше; поведение не меняем.
