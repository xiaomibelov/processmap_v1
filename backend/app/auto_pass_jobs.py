from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from .redis_client import get_client, runtime_status

logger = logging.getLogger(__name__)

QUEUE_KEY = "pm:auto_pass:queue"
JOB_KEY_PREFIX = "pm:auto_pass:job:"
JOB_TTL_SEC = 24 * 60 * 60

_MEMORY_JOB_STATUS: Dict[str, Dict[str, Any]] = {}
_MEMORY_LOCK = threading.RLock()

_WORKER_THREAD: Optional[threading.Thread] = None
_WORKER_LOCK = threading.RLock()
_WORKER_PROCESSOR: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_key(job_id: str) -> str:
    return f"{JOB_KEY_PREFIX}{str(job_id or '').strip()}"


def redis_queue_enabled() -> bool:
    status = runtime_status(force_ping=True)
    return bool(status.get("available") and status.get("mode") == "ON")


def _read_json(raw: Any) -> Optional[Dict[str, Any]]:
    if isinstance(raw, dict):
        return dict(raw)
    src = str(raw or "").strip()
    if not src:
        return None
    try:
        payload = json.loads(src)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def _write_redis_status(job_id: str, payload: Dict[str, Any]) -> bool:
    client = get_client()
    if client is None:
        return False
    try:
        client.setex(_job_key(job_id), JOB_TTL_SEC, json.dumps(payload, ensure_ascii=False))
        return True
    except Exception as exc:
        logger.warning("auto_pass_jobs: failed to write redis status job=%s: %s", job_id, exc)
        return False


def set_job_status(job_id: str, payload: Dict[str, Any]) -> None:
    jid = str(job_id or "").strip()
    if not jid:
        return
    data = dict(payload or {})
    data["job_id"] = jid
    if "updated_at" not in data:
        data["updated_at"] = _now_iso()
    if _write_redis_status(jid, data):
        return
    with _MEMORY_LOCK:
        _MEMORY_JOB_STATUS[jid] = data


def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
    jid = str(job_id or "").strip()
    if not jid:
        return None
    client = get_client()
    if client is not None:
        try:
            raw = client.get(_job_key(jid))
            payload = _read_json(raw)
            if payload is not None:
                return payload
        except Exception as exc:
            logger.warning("auto_pass_jobs: failed to read redis status job=%s: %s", jid, exc)
    with _MEMORY_LOCK:
        if jid in _MEMORY_JOB_STATUS:
            return dict(_MEMORY_JOB_STATUS[jid])
    return None


def _worker_loop() -> None:
    while True:
        processor = _WORKER_PROCESSOR
        if processor is None:
            time.sleep(0.5)
            continue
        client = get_client()
        if client is None:
            time.sleep(1.0)
            continue
        try:
            item = client.blpop(QUEUE_KEY, timeout=2)
        except Exception as exc:
            logger.warning("auto_pass_jobs: BLPOP failed: %s", exc)
            time.sleep(1.0)
            continue
        if not item or len(item) < 2:
            continue
        raw_payload = item[1]
        job_payload = _read_json(raw_payload)
        if not job_payload:
            continue
        job_id = str(job_payload.get("job_id") or "").strip()
        if not job_id:
            continue
        set_job_status(
            job_id,
            {
                "status": "running",
                "progress": 15,
                "session_id": str(job_payload.get("session_id") or ""),
                "run_id": str(job_payload.get("run_id") or ""),
                "mode": str(job_payload.get("mode") or "all"),
                "updated_at": _now_iso(),
            },
        )
        try:
            result = processor(job_payload)
            set_job_status(
                job_id,
                {
                    "status": "completed",
                    "progress": 100,
                    "session_id": str(job_payload.get("session_id") or ""),
                    "run_id": str(job_payload.get("run_id") or ""),
                    "result": result if isinstance(result, dict) else {},
                    "updated_at": _now_iso(),
                },
            )
        except Exception as exc:
            logger.exception("auto_pass_jobs: job failed job=%s", job_id)
            set_job_status(
                job_id,
                {
                    "status": "failed",
                    "progress": 100,
                    "session_id": str(job_payload.get("session_id") or ""),
                    "run_id": str(job_payload.get("run_id") or ""),
                    "error": str(exc),
                    "updated_at": _now_iso(),
                },
            )


def ensure_worker_running(processor: Callable[[Dict[str, Any]], Dict[str, Any]]) -> None:
    global _WORKER_THREAD, _WORKER_PROCESSOR
    with _WORKER_LOCK:
        _WORKER_PROCESSOR = processor
        if _WORKER_THREAD and _WORKER_THREAD.is_alive():
            return
        _WORKER_THREAD = threading.Thread(
            target=_worker_loop,
            name="auto-pass-worker",
            daemon=True,
        )
        _WORKER_THREAD.start()


def enqueue_job(job_payload: Dict[str, Any]) -> bool:
    if not redis_queue_enabled():
        return False
    client = get_client()
    if client is None:
        return False
    try:
        client.rpush(QUEUE_KEY, json.dumps(job_payload, ensure_ascii=False))
        return True
    except Exception as exc:
        logger.warning("auto_pass_jobs: enqueue failed: %s", exc)
        return False
