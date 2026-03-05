from .auto_pass import router as auto_pass_router
from .org import router as org_router
from .projects import router as projects_router
from .reports import router as reports_router
from .sessions import router as sessions_router
from .system import router as system_router
from .templates import router as templates_router

ROUTERS = (
    system_router,
    projects_router,
    sessions_router,
    auto_pass_router,
    reports_router,
    templates_router,
    org_router,
)
