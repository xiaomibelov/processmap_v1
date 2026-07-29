"""add role to users

Revision ID: 001
Revises: 
Create Date: 2026-07-27

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add role column to users table
    op.add_column("users", sa.Column("role", sa.String(20), nullable=False, server_default="analyst"))
    
    # Create index on role
    op.create_index("idx_users_role", "users", ["role"])

def downgrade() -> None:
    # Drop index
    op.drop_index("idx_users_role", table_name="users")
    
    # Drop column
    op.drop_column("users", "role")
