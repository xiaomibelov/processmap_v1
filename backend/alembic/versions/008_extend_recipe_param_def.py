"""extend recipe_param_def: dish_sku_id, qty (MVP final — transformed TO BE templates)

Revision ID: 008
Revises: 007
Create Date: 2026-07-29

AI-трансформированные шаблоны (E3.5) требуют recipe_params dish_sku_id/qty
(полнота рецепта E5.5). Добавляем их в словарь параметров — иначе рецепт
на таком шаблоне невозможно опубликовать (422 «рецепт неполон»), а форма
рецепта не имеет полей ввода.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None

_SEED = [
    # name, type, unit, min, max, enum_json, dict_ref
    ("dish_sku_id", "dict_ref", None, None, None, None, "sku"),
    ("qty", "int", "шт", 1, None, None, None),
]


def upgrade() -> None:
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
    op.execute("DELETE FROM recipe_param_def WHERE name IN ('dish_sku_id', 'qty')")
