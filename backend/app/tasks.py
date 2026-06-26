from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from .celery_app import app
from .overlay_cache import _enc, _k, r, render_overlay_xml

logger = logging.getLogger(__name__)


@app.task(bind=True, max_retries=0)
def render_overlay_task(
    self,
    sid: str,
    bpmn_xml: str,
    annotations: list,
    ver: int,
    qx: int,
    qy: int,
    qs: int,
) -> None:
    start = time.monotonic()
    try:
        xml = render_overlay_xml(sid, bpmn_xml)
        payload = {
            "xml": xml,
            "fresh_until": time.time() + 60,
            "stale_until": time.time() + 90,
        }
        r.set(_k(sid, ver, qx, qy, qs), _enc(payload), ex=90)
    except Exception as exc:
        from .metrics import inc_task_failure
        inc_task_failure("render_overlay_task")
        logger.exception("render_overlay_task failed for %s", sid)
        raise exc
    finally:
        from .metrics import observe_render
        observe_render("redis", time.monotonic() - start)


@app.task(bind=True, max_retries=0)
def create_remaining_subprocess_sessions(
    self,
    parent_session_id: str,
    remaining_elements: List[Dict[str, Optional[str]]],
    current_element_ids: List[str],
) -> None:
    """Create remaining subprocess child sessions and soft-delete removed ones asynchronously."""
    from .services.session_service import (
        auto_create_subprocess_sessions,
        soft_delete_removed_subprocess_sessions,
    )
    from .storage import get_storage

    st = get_storage()
    parent = st.load(parent_session_id, is_admin=True)
    if parent is None:
        logger.warning("create_remaining_subprocess_sessions: parent not found %s", parent_session_id)
        return

    try:
        # Temporarily attach parsed elements so auto_create skips re-parsing.
        parent.bpmn_xml = str(getattr(parent, "bpmn_xml", "") or "")
        auto_create_subprocess_sessions(parent, request=None, limit=len(remaining_elements))
        soft_delete_removed_subprocess_sessions(parent, current_element_ids, request=None)
        project_id = str(getattr(parent, "project_id", "") or "").strip()
        if project_id:
            from .redis_cache import explorer_invalidate_sessions
            try:
                explorer_invalidate_sessions(project_id)
            except Exception:
                logger.exception("failed to invalidate explorer cache for project %s", project_id)
    except Exception:
        logger.exception("create_remaining_subprocess_sessions failed for %s", parent_session_id)
        raise
