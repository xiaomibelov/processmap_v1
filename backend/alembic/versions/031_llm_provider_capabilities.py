"""031 — llm_providers.capabilities (JSON-конфиг провайдера).

Revision ID: 031
Revises: 030
Create Date: 2026-08-26

Добавляет per-provider capability-конфиг. Пока используется флаг
supports_json_mode: провайдерам без поддержки OpenAI-style response_format
не передаётся json_object, для них работает усиление промптом +
толерантный парсер + repair-retry.

Идемпотентно (IF NOT EXISTS для колонки через has_column). Секретов нет.
"""
from alembic import op
import sqlalchemy as sa


revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    if not _has_column("llm_providers", "capabilities"):
        # TEXT вместо JSONB: храним JSON как текст, парсим в Python.
        # Это работает одинаково на Postgres (prod/stage/dev) и SQLite (legacy-тесты).
        op.add_column("llm_providers", sa.Column("capabilities", sa.Text, nullable=False, server_default="{}"))


def downgrade() -> None:
    if _has_column("llm_providers", "capabilities"):
        op.drop_column("llm_providers", "capabilities")
