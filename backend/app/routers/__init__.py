from .auto_pass import router as auto_pass_router
from .admin import router as admin_router
from .diagram_jazz import router as diagram_jazz_router
from .explorer import router as explorer_router
from .org_invites import router as org_invites_router
from .org_listing import router as org_listing_router
from .org_members import router as org_members_router
from .org_property_dictionary import router as org_property_dictionary_router
from .org import router as org_router
from .projects import router as projects_router
from .reports import router as reports_router
from .sessions import router as sessions_router
from .system import router as system_router
from .templates import router as templates_router

ROUTERS = (
    system_router,
    admin_router,
    explorer_router,
    diagram_jazz_router,
    projects_router,
    sessions_router,
    auto_pass_router,
    reports_router,
    templates_router,
    org_invites_router,
    org_listing_router,
    org_members_router,
    org_property_dictionary_router,
    org_router,
)
