"""create process template tables

Revision ID: 002
Revises: 001
Create Date: 2026-07-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create process_template table
    op.create_table(
        "process_template",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("ui_model", postgresql.JSONB),
        sa.Column("created_by", sa.String(255)),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime),
        sa.Column("audit_metadata", postgresql.JSONB),
    )
    
    # Create recipe table
    op.create_table(
        "recipe",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("process_template.id")),
        sa.Column("sku_id", sa.String(100), nullable=False),
        sa.Column("template_version", sa.String(20), nullable=False),
        sa.Column("parameters_json", postgresql.JSONB),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", sa.String(255)),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    
    # Create process_entity table
    op.create_table(
        "process_entity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("process_template.id")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("metadata", postgresql.JSONB),
        sa.Column("created_by", sa.String(255)),
    )
    
    # Create operation_catalog table
    op.create_table(
        "operation_catalog",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("parameter_schema", postgresql.JSONB),
        sa.Column("execution_contract", postgresql.JSONB),
        sa.Column("resource_requirements", postgresql.JSONB),
        sa.Column("allowed_outputs", postgresql.JSONB),
        sa.Column("category", sa.String(100)),
    )
    
    # Create quality_policy table
    op.create_table(
        "quality_policy",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("process_template.id")),
        sa.Column("rule_type", sa.String(100), nullable=False),
        sa.Column("config", postgresql.JSONB),
        sa.Column("created_by", sa.String(255)),
    )
    
    # Create sku_binding table
    op.create_table(
        "sku_binding",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipe.id")),
        sa.Column("kitchen_id", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("pilot_exit_criteria_json", postgresql.JSONB),
        sa.Column("rollout_kitchen_ids", postgresql.JSONB),
        sa.Column("pilot_metrics", postgresql.JSONB),
        sa.Column("created_by", sa.String(255)),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    
    # Create indexes (only if tables were created)
    op.create_index("idx_operation_catalog_code", "operation_catalog", ["code"], if_not_exists=True)
    op.create_index("idx_process_entity_template", "process_entity", ["template_id"], if_not_exists=True)
    op.create_index("idx_recipe_template", "recipe", ["template_id"], if_not_exists=True)

def downgrade() -> None:
    # Drop indexes
    op.drop_index("idx_recipe_template", table_name="recipe", if_exists=True)
    op.drop_index("idx_process_entity_template", table_name="process_entity", if_exists=True)
    op.drop_index("idx_operation_catalog_code", table_name="operation_catalog", if_exists=True)
    
    # Drop tables
    op.drop_table("sku_binding", if_exists=True)
    op.drop_table("quality_policy", if_exists=True)
    op.drop_table("operation_catalog", if_exists=True)
    op.drop_table("process_entity", if_exists=True)
    op.drop_table("recipe", if_exists=True)
    op.drop_table("process_template", if_exists=True)
