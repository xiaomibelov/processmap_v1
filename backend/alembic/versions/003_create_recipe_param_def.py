"""create recipe_param_def dictionary (E5)

Revision ID: 003
Revises: 004 (chained after the concurrently developed 004 to keep a single head)
Create Date: 2026-07-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "003"
down_revision = "004"
branch_labels = None
depends_on = None

_SEED = [
    # name, type, unit, min, max, enum_json, dict_ref
    ("heat_time_sec", "number", "сек", 10, 600, None, None),
    ("target_temp_c", "number", "°C", 60, 100, None, None),
    ("heating_power", "enum", None, None, None, ["low", "medium", "high"], None),
    ("portion_qty", "int", "шт", 1, None, None, None),
    ("source_container_type", "dict_ref", None, None, None, None, "container-types"),
]


def upgrade() -> None:
    op.create_table(
        "recipe_param_def",
        sa.Column("name", sa.String(100), primary_key=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("unit", sa.String(50)),
        sa.Column("min", sa.Float),
        sa.Column("max", sa.Float),
        sa.Column("enum_json", postgresql.JSONB),
        sa.Column("dict_ref", sa.String(100)),
    )
    table = sa.table(
        "recipe_param_def",
        sa.column("name", sa.String),
        sa.column("type", sa.String),
        sa.column("unit", sa.String),
        sa.column("min", sa.Float),
        sa.column("max", sa.Float),
        sa.column("enum_json", postgresql.JSONB),
        sa.column("dict_ref", sa.String),
    )
    op.bulk_insert(
        table,
        [
            {
                "name": name,
                "type": ptype,
                "unit": unit,
                "min": pmin,
                "max": pmax,
                "enum_json": enum,
                "dict_ref": dict_ref,
            }
            for name, ptype, unit, pmin, pmax, enum, dict_ref in _SEED
        ],
    )


def downgrade() -> None:
    op.drop_table("recipe_param_def", if_exists=True)
