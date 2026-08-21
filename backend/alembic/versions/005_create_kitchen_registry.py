"""create kitchen + kitchen_equipment registry (E6.3)

Revision ID: 005
Revises: 003
Create Date: 2026-07-28

Asset Registry v1: capabilities_json — свободный JSON вида
{"capabilities": ["temperature_measurement", ...]} (контракт-словарь позже).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "005"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kitchen",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("location", sa.String(255), nullable=False, server_default=""),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
    )
    op.create_table(
        "kitchen_equipment",
        sa.Column(
            "kitchen_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("kitchen.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("equipment_type_id", sa.String(100), primary_key=True),
        sa.Column("capabilities_json", postgresql.JSONB),
    )


def downgrade() -> None:
    op.drop_table("kitchen_equipment", if_exists=True)
    op.drop_table("kitchen", if_exists=True)
