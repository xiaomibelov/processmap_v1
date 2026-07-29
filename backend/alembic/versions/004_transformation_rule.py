"""create transformation_rule table (E3.5 rule library)

Revision ID: 004
Revises: 002
Create Date: 2026-07-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "004"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transformation_rule",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("rule_id", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("pattern", postgresql.JSONB),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("operation_code", sa.String(100)),
        sa.Column("rationale", sa.Text),
        sa.Column("format_ref", sa.String(120)),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("idx_transformation_rule_enabled", "transformation_rule", ["enabled"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("idx_transformation_rule_enabled", table_name="transformation_rule", if_exists=True)
    op.drop_table("transformation_rule", if_exists=True)
