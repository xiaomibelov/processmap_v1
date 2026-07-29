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
import json
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
    # ON CONFLICT DO NOTHING: идемпотентно даже при частично применённых данных
    # (stage: строки могли быть добавлены вручную/прошлым прогоном).
    bind = op.get_bind()
    for name, ptype, unit, pmin, pmax, enum, dict_ref in _SEED:
        bind.execute(
            sa.text(
                "INSERT INTO recipe_param_def (name, type, unit, min, max, enum_json, dict_ref) "
                "VALUES (:name, :type, :unit, :min, :max, :enum_json, :dict_ref) "
                "ON CONFLICT (name) DO NOTHING"
            ),
            {
                "name": name,
                "type": ptype,
                "unit": unit,
                "min": pmin,
                "max": pmax,
                "enum_json": json.dumps(enum) if enum is not None else None,
                "dict_ref": dict_ref,
            },
        )


def downgrade() -> None:
    op.execute("DELETE FROM recipe_param_def WHERE name IN ('dish_sku_id', 'qty')")
