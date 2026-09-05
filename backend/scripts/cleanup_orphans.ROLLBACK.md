# Rollback plan — миграция 035 (FK-целостность core-таблиц) + cleanup_orphans.sql

Контур: `fix/db-fk-integrity`. Дата: 2026-09-05.

## Что меняется

1. **Данные** (`backend/scripts/cleanup_orphans.sql`): удаление висячих строк в
   `bpmn_versions`, `session_state_versions`, `org_memberships`, `workspaces`;
   обнуление `audit_log.session_id` у висячих audit-записей (строки НЕ удаляются).
2. **Схема** (миграция `035_core_fk_constraints`): 5 FK-констрейнтов на core-таблицы
   (`ON DELETE CASCADE` / `SET NULL` — см. миграцию).

## (a) Откат миграции (схема)

```bash
alembic downgrade 033        # откатывает 035 → 034 → 033
# либо точечно:
alembic downgrade 034        # откатывает только 035
```

Откат снимает 5 FK-констрейнтов (`ALTER TABLE ... DROP CONSTRAINT IF EXISTS`,
идемпотентно). Данные миграция не трогает — откат схемы ничего не восстанавливает
и не удаляет.

Проверка после downgrade: в `pg_constraint` не должно быть
`bpmn_versions_session_id_fkey`, `session_state_versions_session_id_fkey`,
`audit_log_session_id_fkey`, `org_memberships_user_id_fkey`, `workspaces_org_id_fkey`.

## (b) Восстановление данных

**Строки, удалённые `cleanup_orphans.sql`, без бэкапа невосстановимы.**
Обнулённые `audit_log.session_id` тоже восстанавливаются только из бэкапа.

Обязательный шаг ДО прогона с `dry_run=false` — логический бэкап:

```bash
pg_dump -Fc -f "processmap_pre_fk035_$(date +%Y%m%d_%H%M%S).dump" processmap
# убедитесь, что файл непуст и читается:
pg_restore --list processmap_pre_fk035_*.dump | head
```

Восстановление (на остановленном/пустом кластере либо в отдельную базу для выборочного
достать строки):

```bash
# полное восстановление в свежую базу:
createdb processmap_restore
pg_restore -d processmap_restore processmap_pre_fk035_*.dump

# выборочное: достать удалённые org_memberships из бэкапа и вернуть в рабочую базу
pg_restore -d processmap_restore --table=org_memberships processmap_pre_fk035_*.dump
# далее INSERT ... SELECT из processmap_restore в processmap по списку удалённых ключей.
```

Для точечного отката `audit_log`: в бэкапе исходные `session_id` сохранены —
восстанавливаются тем же механизмом (`UPDATE ... FROM` по `id` из restore-базы).

## (c) CSV-архив cleanup_orphans.sql (быстрый просмотр без pg_restore)

При apply-прогоне cleanup каждая порция orphan-строк перед DELETE/UPDATE
выгружается через `\o <файл>` + `COPY ... TO STDOUT` в `orphans_archive/<table>_orphans.csv`
(клиентские пути — относительно cwd psql; bpmn_xml и payload-колонки не входят
в архив, они есть в pg_dump). Это НЕ canonical backup, а быстрый способ:

- просмотреть/проверить удалённое без `pg_restore`;
- вручную вернуть отдельные строки (сконвертировать CSV обратно в INSERT —
  колонки в CSV совпадают с целевыми таблицами, кроме отсутствующих TOAST-полей).

Canonical source of truth для восстановления — всё равно **pg_dump**
(см. п. b): CSV не содержит `bpmn_versions.bpmn_xml` и payload
`session_state_versions`, а повторный прогон cleanup перезаписывает архивы
header-only.

## Порядок операций при откате

1. `alembic downgrade 034` (снимаем FK — иначе повторная вставка «висячих» строк
   из бэкапа будет отклонена FK).
2. Восстановить нужные строки из `pg_dump` (см. выше).
3. При необходимости вернуть `alembic_version` в состояние до миграции
   downgrade уже сделал это сам (035 → 034).
