"""sku_binding pilot contour (E9)

Revision ID: 007
Revises: 006
Create Date: 2026-07-28

E9.1 — доводка sku_binding (из 002, E1) до модели пилотного контура:

  статусы: draft → pilot → active → retired

Новые поля (старые колонки kitchen_id / rollout_kitchen_ids / pilot_metrics
сохранены для обратной совместимости, audit_log НЕ затрагивается):

  recipe_version          — версия рецепта, к которой привязан SKU
  kitchen_ids             — jsonb-массив кухонь, где SKU активен
  pilot_kitchen_id        — единственная пилотная кухня
  valid_from / valid_to   — окно действия привязки
  created_at              — штамп создания

E9.4 — pilot_metric_sample: ручной (MVP) ввод метрик пилота
(orders_count / critical_errors / defect_count на выборку), источник — САУ РТК
(контракт: docs/e9/metrics_contract.md).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # E1-колонка kitchen_id (NOT NULL) заменена массивом kitchen_ids — ослабляем.
    op.alter_column("sku_binding", "kitchen_id", existing_type=sa.String(100), nullable=True)
    op.add_column("sku_binding", sa.Column("recipe_version", sa.String(20)))
    op.add_column("sku_binding", sa.Column("kitchen_ids", postgresql.JSONB))
    op.add_column("sku_binding", sa.Column("pilot_kitchen_id", sa.String(100)))
    op.add_column("sku_binding", sa.Column("valid_from", sa.DateTime))
    op.add_column("sku_binding", sa.Column("valid_to", sa.DateTime))
    op.add_column(
        "sku_binding",
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    # Backfill kitchen_ids из E1-полей (rollout_kitchen_ids или одиночный kitchen_id).
    # Колонка rollout_kitchen_ids может отсутствовать в legacy-форме таблицы
    # (stage: схема наполнялась вне alembic) — проверяем наличие.
    bind = op.get_bind()
    has_rollout_kitchen_ids = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='sku_binding' AND column_name='rollout_kitchen_ids' LIMIT 1"
        )
    ).fetchone()
    if has_rollout_kitchen_ids:
        op.execute(
            """
            UPDATE sku_binding
               SET kitchen_ids = COALESCE(
                   rollout_kitchen_ids,
                   CASE WHEN kitchen_id IS NOT NULL AND kitchen_id <> ''
                        THEN jsonb_build_array(kitchen_id)
                        ELSE '[]'::jsonb
                   END
               )
             WHERE kitchen_ids IS NULL
            """
        )
    else:
        op.execute(
            """
            UPDATE sku_binding
               SET kitchen_ids = CASE WHEN kitchen_id IS NOT NULL AND kitchen_id <> ''
                        THEN jsonb_build_array(kitchen_id)
                        ELSE '[]'::jsonb
                   END
             WHERE kitchen_ids IS NULL
            """
        )
    op.create_index(
        "idx_sku_binding_status", "sku_binding", ["status"], if_not_exists=True
    )
    op.create_index(
        "idx_sku_binding_recipe", "sku_binding", ["recipe_id"], if_not_exists=True
    )

    op.create_table(
        "pilot_metric_sample",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "binding_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sku_binding.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ts", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("orders_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("critical_errors", sa.Integer, nullable=False, server_default="0"),
        sa.Column("defect_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index(
        "idx_pilot_metric_sample_binding",
        "pilot_metric_sample",
        ["binding_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_pilot_metric_sample_binding",
        table_name="pilot_metric_sample",
        if_exists=True,
    )
    op.drop_table("pilot_metric_sample", if_exists=True)
    op.drop_index("idx_sku_binding_recipe", table_name="sku_binding", if_exists=True)
    op.drop_index("idx_sku_binding_status", table_name="sku_binding", if_exists=True)
    for column in (
        "created_at",
        "valid_to",
        "valid_from",
        "pilot_kitchen_id",
        "kitchen_ids",
        "recipe_version",
    ):
        op.drop_column("sku_binding", column)
    op.alter_column("sku_binding", "kitchen_id", existing_type=sa.String(100), nullable=False)
