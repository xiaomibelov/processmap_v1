"""create version tables (E7 — publishing & versioning)

Revision ID: 006
Revises: 005
Create Date: 2026-07-28

process_template_version — иммутабельные опубликованные версии шаблона
(ui_model + bpmn_xml + отчёты dry-run/pre-check на момент публикации).
recipe_version — история публикаций рецептов (snapshot параметров).
Статусы версий: published → retired (когда вышла более новая published).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "process_template_version",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("process_template.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="published"),
        sa.Column("ui_model", postgresql.JSONB),
        sa.Column("bpmn_xml", sa.Text),
        sa.Column("precheck_report", postgresql.JSONB),
        sa.Column("dry_run_report", postgresql.JSONB),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("template_id", "version", name="uq_process_template_version"),
    )
    op.create_index(
        "idx_process_template_version_template",
        "process_template_version",
        ["template_id"],
        if_not_exists=True,
    )
    op.create_table(
        "recipe_version",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "recipe_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recipe.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="published"),
        sa.Column("parameters_json", postgresql.JSONB),
        sa.Column("template_id", postgresql.UUID(as_uuid=True)),
        sa.Column("template_version", sa.String(20)),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("recipe_id", "version", name="uq_recipe_version"),
    )
    op.create_index(
        "idx_recipe_version_recipe",
        "recipe_version",
        ["recipe_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("idx_recipe_version_recipe", table_name="recipe_version", if_exists=True)
    op.drop_table("recipe_version", if_exists=True)
    op.drop_index(
        "idx_process_template_version_template",
        table_name="process_template_version",
        if_exists=True,
    )
    op.drop_table("process_template_version", if_exists=True)
