"""E6 — dry-run validation + feasibility pre-check.

- service.validate_ui_model: единая точка входа для правил R1–R7 над ui_model.
- service.load_catalog_from_db: каталог операций из БД (operation_catalog).
- precheck.precheck_ui_model: сверка resource_requirements с реестром кухонь.
"""
from .service import (  # noqa: F401
    ALLOWED_OPERATION_CODES,
    FORBIDDEN_OPERATION_CODES,
    LEGACY_TASK_TYPES,
    load_catalog_from_db,
    validate_ui_model,
    validate_with_catalog,
)
from .precheck import precheck_ui_model, precheck_with_catalog  # noqa: F401
