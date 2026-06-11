from __future__ import annotations

import logging
import time

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
