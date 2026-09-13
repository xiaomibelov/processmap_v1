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


# F1 (fix/save-latency-subprocess-async, Б1–Б4): async subprocess-sync для
# canvas-сохранений (dispatch в session_service.bpmn_save под флагом
# FPC_ASYNC_SUBPROCESS_SYNC). Явный импорт (bpmn_upload/import/... —
# _SUBPROCESS_SYNC_SOURCE_ACTIONS) остаётся синхронным в bpmn_save.
_SYNC_SUBPROCESSES_LOCK_TTL_MS = 120_000
_SYNC_SUBPROCESSES_MAX_ATTEMPTS = 3  # 1 первичный запуск + 2 retry


@app.task(
    bind=True,
    max_retries=_SYNC_SUBPROCESSES_MAX_ATTEMPTS - 1,
    name="processmap.sessions.sync_subprocesses_task",
    ignore_result=True,
)
def sync_subprocesses_task(self, session_id: str, org_id: str = "") -> None:
    """Идемпотентный subprocess-sync для одной сессии.

    - Redis-lock на сессию TTL 120 s: занят → retry с экспоненциальным
      backoff, всего ≤ 3 попыток; исчерпание попыток — лог + метрика, НЕ
      всплывающая ошибка и НЕ запись в сессионную строку.
    - Повторный запуск с тем же аргументом безопасен (skip_existing/heal,
      soft-delete только протухших по keep-list).
    - НЕ пишет сессионную строку родителя: счётчики subprocesses_* —
      read-model (Б3) и читаются get_session_meta; post-CAS запись
      счётчиков запрещена (F2, LWW не усугубляем).
    """
    from celery.exceptions import MaxRetriesExceededError

    from .redis_lock import acquire_session_lock

    sid = str(session_id or "").strip()
    if not sid:
        return
    lock = acquire_session_lock(sid, ttl_ms=_SYNC_SUBPROCESSES_LOCK_TTL_MS)
    if not lock.acquired:
        try:
            countdown = 2 ** min(int(getattr(self.request, "retries", 0) or 0), 4)
            self.retry(countdown=countdown)
        except MaxRetriesExceededError:
            from .metrics import inc_task_failure

            inc_task_failure("sync_subprocesses_task")
            logger.error(
                "sync_subprocesses_task: lock busy, retries exhausted (session_id=%s)",
                sid,
            )
        return
    try:
        from .storage import get_storage
        from .services.session_service import auto_create_subprocess_sessions

        st = get_storage()
        sess = st.load(sid, is_admin=True)
        if sess is None:
            logger.warning("sync_subprocesses_task: session %s not found", sid)
            return
        summary = auto_create_subprocess_sessions(sess, None, limit=None)
        logger.info(
            "sync_subprocesses_task: session_id=%s created=%s restored=%s "
            "soft_deleted=%s nested_errors=%s",
            sid,
            len(summary.get("created") or []),
            len(summary.get("restored") or []),
            len(summary.get("soft_deleted") or []),
            int(summary.get("nested_errors") or 0),
        )
    except Exception as exc:
        from .metrics import inc_task_failure

        inc_task_failure("sync_subprocesses_task")
        logger.exception("sync_subprocesses_task failed for %s", sid)
        raise exc
    finally:
        lock.release()
