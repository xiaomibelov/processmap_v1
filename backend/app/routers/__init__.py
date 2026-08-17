from .auto_pass import router as auto_pass_router
from .admin import router as admin_router
from .admin_llm import router as admin_llm_router
from .admin_testgen import router as admin_testgen_router
from .llm_status import router as llm_status_router
from .llm_feedback import router as llm_feedback_router
from .version import router as version_router
from .api_docs import router as api_docs_router
from .analytics import router as analytics_router
from .clipboard import router as clipboard_router
from .error_events import router as error_events_router
from .explorer import router as explorer_router
from .org_invites import router as org_invites_router
from .org_listing import router as org_listing_router
from .org_members import router as org_members_router
from .org_groups import router as org_groups_router
from .notes import router as notes_router
from .org_property_dictionary import router as org_property_dictionary_router
from .product_actions_registry import router as product_actions_registry_router
from .process_properties_registry import router as process_properties_registry_router
from .product_actions_ai import router as product_actions_ai_router
from .project_analytics import router as project_analytics_router
from .rag import router as rag_router
from .org import router as org_router
from .projects import router as projects_router
from .reports import router as reports_router
from .sessions import router as sessions_router
from .session_events import router as session_events_router
from ..save_services.status_service.status_api import router as status_service_router
from .system import router as system_router
from .templates import router as templates_router
from .feature_flags import router as feature_flags_router
from .reference_resolver import router as reference_resolver_router
from .deployment_notices import router as deployment_notices_router
from .recipes import router as recipes_router
from .process_templates import router as process_templates_router
from .operation_catalog import router as operation_catalog_router
from .dictionaries import router as dictionaries_router
from .health import router as health_router
from .transformation import router as transformation_router
from .kitchens import router as kitchens_router
from .sku_bindings import router as sku_bindings_router
from .audit_log import router as audit_log_router
from .agent_chat import router as agent_chat_router
from .users_preferences import router as users_preferences_router

# (router, openapi_tags).  Routers that already set their own tags keep them;
# the tuple provides a fallback/default tag for Swagger UI grouping.
ROUTERS = (
    (system_router, ["system"]),
    (admin_router, ["admin"]),
    (admin_llm_router, ["admin"]),
    (admin_testgen_router, ["admin"]),
    (llm_status_router, ["llm"]),
    (llm_feedback_router, ["llm"]),
    (error_events_router, ["error-events"]),
    (explorer_router, ["explorer"]),
    (projects_router, ["projects"]),
    (sessions_router, ["sessions"]),
    (session_events_router, ["session-events"]),
    (status_service_router, ["save-status"]),
    (product_actions_ai_router, ["product-actions-ai"]),
    (product_actions_registry_router, ["product-actions-registry"]),
    (process_properties_registry_router, ["process-properties-registry"]),
    (project_analytics_router, ["project-analytics"]),
    (analytics_router, ["analytics"]),
    (rag_router, ["rag"]),
    (notes_router, ["notes"]),
    (clipboard_router, ["clipboard"]),
    (auto_pass_router, ["auto-pass"]),
    (reports_router, ["reports"]),
    (templates_router, ["templates"]),
    (org_invites_router, ["org-invites"]),
    (org_listing_router, ["org-listing"]),
    (org_members_router, ["org-members"]),
    (org_groups_router, ["org-groups"]),
    (org_property_dictionary_router, ["org-property-dictionary"]),
    (org_router, ["organizations"]),
    (version_router, ["version"]),
    (api_docs_router, ["system"]),
    (feature_flags_router, ["feature-flags"]),
    (reference_resolver_router, ["reference-resolver"]),
    (deployment_notices_router, ["deployment-notices"]),
    (recipes_router, ["recipes"]),
    (transformation_router, ["transformation"]),
    (process_templates_router, ["process-templates"]),
    (operation_catalog_router, ["operation-catalog"]),
    (dictionaries_router, ["dictionaries"]),
    (kitchens_router, ["kitchens"]),
    (sku_bindings_router, ["sku-bindings"]),
    (audit_log_router, ["audit-log"]),
    (health_router, ["health"]),
    (agent_chat_router, ["agent"]),
    (users_preferences_router, ["users"]),
)
