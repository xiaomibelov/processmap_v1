"""add name_ru to operation_catalog (L10N)

Revision ID: 009
Revises: 008
Create Date: 2026-07-29

Русские названия операций для UI технолога (L3): карточки каталога показывают
name_ru, код — второй строкой. Значения заполняет идемпотентный сид
backend/seed_operations.py.
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("operation_catalog", sa.Column("name_ru", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("operation_catalog", "name_ru")
