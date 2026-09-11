"""Canvas editing helpers for AGENT-3 HITL."""
from __future__ import annotations

from .applier import apply_edit_plan, EditApplyError
from .planner import propose_edit_plan
from .state import create_pending_edit, get_pending_edit, update_pending_edit_status
from .validator import build_human_diff, validate_edit_plan

__all__ = [
    "apply_edit_plan",
    "build_human_diff",
    "create_pending_edit",
    "EditApplyError",
    "get_pending_edit",
    "propose_edit_plan",
    "update_pending_edit_status",
    "validate_edit_plan",
]
