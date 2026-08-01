"""sessions: write-guard unique indexes (save-pipeline audit P3/P4)

Revision ID: 011
Revises: 010
Create Date: 2026-07-31

- UNIQUE natural key для project-scoped корневых сессий
  (org_id, COALESCE(project_id,''), lower(title), COALESCE(mode,'')) —
  идемпотентный create, race-дедуп (аудит P3).
- UNIQUE для TO BE-копий (org_id, project, derived_from_session_id) —
  одна TO BE на AS IS в проекте (аудит P3).
- UNIQUE (session_id, org_id, version_number) на bpmn_versions (аудит P4)
  — уже создаётся рантаймом в storage._ensure_schema, здесь для паритета.

Индексы создаются ТОЛЬКО если дублей нет; при дублях — пропуск с warning
(деструктивная чистка пользовательских данных — отдельное решение владельца,
см. docs/fix-save/track_b_report.md).
"""
from alembic import op


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


_NATURAL_DUP_CHECK = """
SELECT org_id, COALESCE(project_id,''), lower(title), COALESCE(mode,''), COUNT(*) AS c
  FROM sessions
 WHERE (parent_session_id IS NULL OR parent_session_id = '')
   AND project_id IS NOT NULL AND project_id != ''
   AND mode IS NOT NULL AND mode != ''
 GROUP BY 1, 2, 3, 4
HAVING COUNT(*) > 1
 LIMIT 1
"""

_TOBE_DUP_CHECK = """
SELECT org_id, COALESCE(project_id,''), derived_from_session_id, COUNT(*) AS c
  FROM sessions
 WHERE derived_from_session_id IS NOT NULL AND derived_from_session_id != ''
   AND process_layer = 'to_be'
   AND (parent_session_id IS NULL OR parent_session_id = '')
 GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
 LIMIT 1
"""


def upgrade() -> None:
    conn = op.get_bind()

    dup = conn.exec_driver_sql(_NATURAL_DUP_CHECK).fetchone()
    if dup is None:
        op.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_natural_key_unique
            ON sessions(org_id, COALESCE(project_id,''), lower(title), COALESCE(mode,''))
            WHERE (parent_session_id IS NULL OR parent_session_id = '')
              AND project_id IS NOT NULL AND project_id != ''
              AND mode IS NOT NULL AND mode != ''
            """
        )
    else:
        print(f"WARNING: idx_sessions_natural_key_unique skipped, duplicates exist: {dup}")

    dup_tobe = conn.exec_driver_sql(_TOBE_DUP_CHECK).fetchone()
    if dup_tobe is None:
        op.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_tobe_derived_unique
            ON sessions(org_id, COALESCE(project_id,''), derived_from_session_id)
            WHERE derived_from_session_id IS NOT NULL AND derived_from_session_id != ''
              AND process_layer = 'to_be'
              AND (parent_session_id IS NULL OR parent_session_id = '')
            """
        )
    else:
        print(f"WARNING: idx_sessions_tobe_derived_unique skipped, duplicates exist: {dup_tobe}")

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bpmn_versions_session_version
        ON bpmn_versions(session_id, org_id, version_number)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_sessions_natural_key_unique")
    op.execute("DROP INDEX IF EXISTS idx_sessions_tobe_derived_unique")
    op.execute("DROP INDEX IF EXISTS idx_bpmn_versions_session_version")
