"""Settings for the background agent-analysis pipeline.

Env vars are fallback defaults only; the admin-facing surface is the LLM
features panel (feature flag `agent_analysis` + per-feature model/limits).
"""

from __future__ import annotations

import os

FEATURE = "agent_analysis"

DEFAULT_DEBOUNCE_SEC = 60
DEFAULT_BEAT_LIMIT_SESSIONS = 50
WATCH_ZSET_KEY = "pm:agent_analysis:watch"


def save_trigger_enabled() -> bool:
    """True when the save-hook trigger is configured (default: on)."""
    return os.environ.get("AGENT_ANALYSIS_TRIGGER", "save").strip().lower() not in {"off", "beat", "disabled", "0"}


def beat_trigger_enabled() -> bool:
    return os.environ.get("AGENT_ANALYSIS_TRIGGER", "save").strip().lower() in {"save", "beat", "on", "1"}


def debounce_sec() -> int:
    try:
        return max(0, int(float(os.environ.get("AGENT_ANALYSIS_DEBOUNCE_SEC", "") or DEFAULT_DEBOUNCE_SEC)))
    except Exception:
        return DEFAULT_DEBOUNCE_SEC


def beat_limit_sessions() -> int:
    try:
        return max(1, int(float(os.environ.get("AGENT_ANALYSIS_BEAT_LIMIT", "") or DEFAULT_BEAT_LIMIT_SESSIONS)))
    except Exception:
        return DEFAULT_BEAT_LIMIT_SESSIONS
