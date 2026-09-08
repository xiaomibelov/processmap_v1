"""Startup seed for the agent_analysis LLM feature flag.

Default state: DISABLED (feature is opt-in via the admin LLM panel).
`patch_feature_flag` inserts the row only when missing, so this is idempotent.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def seed_agent_analysis_feature_flag() -> None:
    try:
        from ..ai import llm_store

        llm_store.patch_feature_flag("agent_analysis", enabled=False, actor="bootstrap")
    except Exception:
        logger.exception("failed to seed agent_analysis feature flag")
