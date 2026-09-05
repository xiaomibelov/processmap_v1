"""035 — FK-целостность core-таблиц (fix/db-fk-integrity).

Revision ID: 035
Revises: 034
Create Date: 2026-09-05

Read-only аудит показал: на core-таблицах внешних ключей нет
(17 FK только на вторичных доменах), висячие ссылки подтверждены
(orgs_memberships.user_id, workspaces.org_id, bpmn_versions.session_id,
session_state_versions.session_id, audit_log.session_id).

Создаём 5 FK:
- bpmn_versions.session_id → sessions.id ON DELETE CASCADE
- session_state_versions.session_id → sessions.id ON DELETE CASCADE
- audit_log.session_id → sessions.id ON DELETE SET NULL (audit trail выживает)
- org_memberships.user_id → users.id ON DELETE CASCADE
- workspaces.org_id → orgs.id ON DELETE CASCADE

Fail-fast: перед созданием констрейнтов считаем висячие ссылки
(NOT EXISTS, портируемый SQL). Если хотя бы одна > 0 — raise
с перечнем отношений и счётчиками; чистка — через
backend/scripts/cleanup_orphans.sql (dry-run → apply → повторный upgrade).

Устойчивость bootstrap: core-таблицы создаются runtime-DDL
(CREATE IF NOT EXISTS) ПОСЛЕ alembic, поэтому на свежей/частичной БД
часть таблиц может отсутствовать. Проверка висячих ссылок для
отсутствующей таблицы = 0 (нечему быть висячим), FK на отсутствующую
таблицу пропускается с warning (прецедент — 011: индекс пропускается
при дублях вместо деструктивной чистки).
"""
from alembic import op
import sqlalchemy as sa


revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


# (child, child_column, parent, parent_column, ondelete, child_column_nullable)
_FKS = [
    ("bpmn_versions", "session_id", "sessions", "id", "CASCADE", False),
    ("session_state_versions", "session_id", "sessions", "id", "CASCADE", False),
    ("audit_log", "session_id", "sessions", "id", "SET NULL", True),
    ("org_memberships", "user_id", "users", "id", "CASCADE", False),
    ("workspaces", "org_id", "orgs", "id", "CASCADE", False),
]

# Имена констрейнтов — по умолчанию Postgres (<table>_<column>_fkey),
# как у 17 существующих FK.

_ORPHAN_COUNT = """
SELECT COUNT(*) FROM {child} c
WHERE {not_null} NOT EXISTS (SELECT 1 FROM {parent} p WHERE p.{pcol} = c.{ccol})
"""


def _table_exists(conn, name: str) -> bool:
    return bool(
        conn.execute(sa.text("SELECT to_regclass(:n) IS NOT NULL"), {"n": name}).scalar()
    )


def _constraint_exists(conn, name: str) -> bool:
    return (
        conn.execute(
            sa.text("SELECT 1 FROM pg_constraint WHERE conname = :n LIMIT 1"),
            {"n": name},
        ).first()
        is not None
    )


def upgrade() -> None:
    conn = op.get_bind()

    orphans = []
    for child, ccol, parent, pcol, _ondelete, nullable in _FKS:
        if not (_table_exists(conn, child) and _table_exists(conn, parent)):
            continue  # runtime-DDL ещё не создал таблицу — нечему быть висячим
        not_null = f"c.{ccol} IS NOT NULL AND" if nullable else ""
        count = conn.execute(
            sa.text(_ORPHAN_COUNT.format(child=child, ccol=ccol, parent=parent, pcol=pcol, not_null=not_null))
        ).scalar()
        if count and count > 0:
            orphans.append(f"{child}.{ccol} → {parent}.{pcol}: {count}")

    if orphans:
        raise Exception(
            "миграция 035: обнаружены висячие ссылки (orphan rows):\n  "
            + "\n  ".join(orphans)
            + "\nСначала примените backend/scripts/cleanup_orphans.sql"
            " (dry_run=true для оценки, затем dry_run=false),"
            " после чего повторите alembic upgrade head."
        )

    for child, ccol, parent, pcol, ondelete, _nullable in _FKS:
        name = f"{child}_{ccol}_fkey"
        if not (_table_exists(conn, child) and _table_exists(conn, parent)):
            print(f"WARNING: FK {name} skipped, table {child} or {parent} missing (runtime-DDL ещё не создал)")
            continue
        if _constraint_exists(conn, name):
            print(f"WARNING: FK {name} already exists, skipped")
            continue
        op.execute(
            f"ALTER TABLE {child} ADD CONSTRAINT {name} "
            f"FOREIGN KEY ({ccol}) REFERENCES {parent} ({pcol}) ON DELETE {ondelete}"
        )


def downgrade() -> None:
    for child, ccol, *_ in _FKS:
        op.execute(f"ALTER TABLE {child} DROP CONSTRAINT IF EXISTS {child}_{ccol}_fkey")
