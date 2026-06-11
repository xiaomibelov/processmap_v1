"""Redis Overlay Cache. Redis 7.2 standalone, maxmemory 512mb, allkeys-lru.
zstd level 3. TTL 90s (60 fresh + 30 stale). Render timeout 150ms. Lock 10s."""
from __future__ import annotations
import json, time, uuid
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable
import os
import redis
import zstandard as zstd  # type: ignore[import-untyped]

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
ZSTD_LEVEL, FRESH, STALE, LOCK_TTL, MAX_ATTEMPTS = 3, 60, 30, 10, 1
HARD_TTL = 90
_pool = redis.ConnectionPool.from_url(REDIS_URL, decode_responses=False)
r = redis.Redis(connection_pool=_pool)

class _CB:
    def __init__(self, fail_rate: float = 0.5, window: int = 10, cool_down: int = 2) -> None:
        self.fail_rate, self.window, self.cool_down = fail_rate, window, cool_down
        self._calls: deque[tuple[float, bool]] = deque()
        self._open_until = 0.0
    def _prune(self) -> None:
        cutoff = time.time() - self.window
        while self._calls and self._calls[0][0] < cutoff:
            self._calls.popleft()
    @property
    def is_open(self) -> bool:
        self._prune()
        ok = time.time() < self._open_until
        try:
            from .metrics import set_breaker
            set_breaker("postgres", 2 if ok else 0)
        except Exception:
            pass
        return ok
    def call(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        if self.is_open: raise Exception("circuit open")
        ok = False
        try: res = fn(*args, **kwargs); ok = True; return res
        finally:
            self._prune(); self._calls.append((time.time(), ok))
            if sum(1 for _, ok in self._calls if not ok) / max(len(self._calls), 1) > self.fail_rate:
                self._open_until = time.time() + self.cool_down
pg_cb = _CB()

@dataclass(frozen=True)
class Result:
    status: int
    body: str | dict[str, Any]
    headers: dict[str, str] | None = None

def _k(sid: str, ver: int, qx: int, qy: int, qs: int) -> str: return f"pm:{{{sid}}}:v:{ver}:{qx}:{qy}:{qs}"
def _lk(sid: str, ver: int, qx: int, qy: int, qs: int) -> str: return f"pm:{{{sid}}}:v:{ver}:{qx}:{qy}:{qs}:lock"
def _enc(d: dict[str, Any]) -> bytes: return zstd.ZstdCompressor(level=ZSTD_LEVEL).compress(json.dumps(d).encode())
def _dec(b: bytes) -> dict[str, Any]: return json.loads(zstd.ZstdDecompressor().decompress(b))

def fetch_session_bpmn(sid: str) -> str: raise NotImplementedError  # app-provided
def fetch_annotations(sid: str) -> list[dict[str, Any]]: raise NotImplementedError  # app-provided
def render_svg(bpmn_xml: str, annotations: list[dict[str, Any]]) -> str:  # TODO: real overlay logic
    return bpmn_xml

def render_overlay_xml(sid: str, bpmn_xml: str) -> str:
    raise NotImplementedError  # app-provided

def _get_overlay(sid: str, zoom: float, pan_x: float, pan_y: float, attempt: int = 0) -> Result:
    qx, qy, qs = int(pan_x // 100), int(pan_y // 100), int(zoom * 10)
    ver, redis_up = 0, True
    try:
        ver = int(r.get(f"pm:{{{sid}}}:ver") or 0)
        raw = r.get(_k(sid, ver, qx, qy, qs))
        if raw:
            e = _dec(raw); now = time.time()
            if now < e["fresh_until"]: return Result(200, e["xml"])
            if now < e["stale_until"]:
                try:
                    bpmn = fetch_session_bpmn(sid)
                    annots = fetch_annotations(sid)
                    from .tasks import render_overlay_task
                    render_overlay_task.delay(sid, bpmn, annots, ver, qx, qy, qs)
                except Exception:
                    pass
                return Result(200, e["xml"])
    except redis.RedisError: redis_up = False

    if not redis_up:
        try:
            xml = render_overlay_xml(sid, fetch_session_bpmn(sid))
            return Result(200, xml)
        except Exception:
            if pg_cb.is_open: return Result(200, {"wireframe": True, "elements": []})
            return Result(503, {"error": "origin unavailable"}, {"Retry-After": "2"})

    try: got = r.set(_lk(sid, ver, qx, qy, qs), "1", nx=True, ex=LOCK_TTL)
    except redis.RedisError: got = None

    if got:
        try:
            bpmn = fetch_session_bpmn(sid)
            annots = fetch_annotations(sid)
            from .tasks import render_overlay_task
            render_overlay_task.delay(sid, bpmn, annots, ver, qx, qy, qs)
        except Exception:
            pass

    # Always serve fallback render on miss so frontend never sees 202.
    try:
        xml = render_overlay_xml(sid, fetch_session_bpmn(sid))
        return Result(200, xml)
    except Exception:
        if pg_cb.is_open:
            return Result(200, {"wireframe": True, "elements": []})
        return Result(503, {"error": "origin unavailable"}, {"Retry-After": "2"})

def get_overlay(sid: str, zoom: float, pan_x: float, pan_y: float, attempt: int = 0) -> Result:
    start = time.monotonic()
    res = _get_overlay(sid, zoom, pan_x, pan_y, attempt)
    from .metrics import observe_hit
    observe_hit(res.status, time.monotonic() - start)
    return res

def invalidate_overlay(sid: str) -> None:
    try: r.incr(f"pm:{{{sid}}}:ver")
    except redis.RedisError: pass


def compute_overlays_json(sid: str) -> list[dict[str, Any]]:
    raise NotImplementedError  # app-provided

def get_overlays_json(sid: str) -> list[dict[str, Any]]:
    ver = 0
    try:
        ver = int(r.get(f"pm:{{{sid}}}:ver") or 0)
    except redis.RedisError:
        pass
    key = f"pm:{{{sid}}}:ovl:{ver}"
    try:
        raw = r.get(key)
        if raw:
            return json.loads(zstd.ZstdDecompressor().decompress(raw))
    except Exception:
        pass
    try:
        overlays = compute_overlays_json(sid)
        payload = json.dumps(overlays).encode()
        compressed = zstd.ZstdCompressor(level=ZSTD_LEVEL).compress(payload)
        r.setex(key, 30, compressed)
        return overlays
    except Exception:
        return []
