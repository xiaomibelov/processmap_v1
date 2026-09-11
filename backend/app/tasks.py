from __future__ import annotations

import logging
import time

from .celery_app import app
from . import overlay_cache as _overlay_cache

logger = logging.getLogger(__name__)


# Каноническое имя: не зависит от import-контекста (app.* vs backend.app.*),
# устраняет split-brain регистрации (fix/celery-task-naming-splitbrain).
@app.task(bind=True, max_retries=0, name="processmap.overlay.render_overlay_task")
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
        # Разрешение через модуль, а не from-import: иначе имя связывается со
        # stub'ом на момент импорта и wiring (overlay_wiring.wire) не действует
        # (fix/overlay-render-notimplemented).
        xml = _overlay_cache.render_overlay_xml(sid, bpmn_xml)
        payload = {
            "xml": xml,
            "fresh_until": time.time() + 60,
            "stale_until": time.time() + 90,
        }
        _overlay_cache.r.set(
            _overlay_cache._k(sid, ver, qx, qy, qs),
            _overlay_cache._enc(payload),
            ex=90,
        )
    except Exception as exc:
        from .metrics import inc_task_failure
        inc_task_failure("render_overlay_task")
        logger.exception("render_overlay_task failed for %s", sid)
        raise exc
    finally:
        from .metrics import observe_render
        observe_render("redis", time.monotonic() - start)


# NOTE: the Celery task `create_remaining_subprocess_sessions` was removed.
# It had zero dispatchers (dead code): `session_service.bpmn_save` now
# materializes, refreshes and soft-deletes ALL subprocess child sessions
# synchronously with limit=None, so an async remainder task is obsolete.
