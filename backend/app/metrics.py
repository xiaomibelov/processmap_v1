from prometheus_client import Counter, Histogram, Gauge, generate_latest, REGISTRY
import threading, time


def _get_or_create(factory, name, *args, **kwargs):
    """Return an existing collector if already registered, otherwise create one.

    This makes the module safe to import under multiple package prefixes
    (e.g. ``backend.app.metrics`` and ``app.metrics``).
    """
    kwargs.setdefault("registry", REGISTRY)
    if name in REGISTRY._names_to_collectors:
        return REGISTRY._names_to_collectors[name]
    return factory(name, *args, **kwargs)


_cache_hit = _get_or_create(Counter, "overlay_cache_hit_total", "", ["status"])
_cache_lat = _get_or_create(
    Histogram,
    "overlay_cache_latency_seconds",
    "",
    ["hit"],
    buckets=[0.005, 0.015, 0.05, 0.15, 0.3, 1.0],
)
_render_dur = _get_or_create(
    Histogram,
    "overlay_render_duration_seconds",
    "",
    ["source"],
    buckets=[0.05, 0.15, 0.3, 1.0, 3.0],
)
_celery_q = _get_or_create(Gauge, "celery_queue_length", "", ["name"])
_celery_fail = _get_or_create(
    Counter, "celery_task_failures_total", "", ["task"]
)
_redis_mem = _get_or_create(Gauge, "redis_memory_used_bytes", "")
_redis_evict = _get_or_create(Gauge, "redis_evicted_keys_total", "")
_breaker = _get_or_create(Gauge, "circuit_breaker_state", "", ["breaker"])


def observe_hit(status: int, latency: float):
    _cache_hit.labels(status=str(status)).inc()
    _cache_lat.labels(hit=str(status == 200)).observe(latency)


def observe_render(source: str, duration: float):
    _render_dur.labels(source=source).observe(duration)


def set_queue(name: str, length: int):
    _celery_q.labels(name=name).set(length)


def inc_task_failure(task: str):
    _celery_fail.labels(task=task).inc()


def set_breaker(name: str, state: int):
    _breaker.labels(breaker=name).set(state)


def metrics() -> bytes:
    return generate_latest(REGISTRY)


def _poll(rc):
    while True:
        try:
            _redis_mem.set(rc.info("memory")["used_memory"])
            _redis_evict.set(rc.info("stats").get("evicted_keys", 0))
        except Exception:
            pass
        time.sleep(15)


def start_polling(rc):
    threading.Thread(target=_poll, args=(rc,), daemon=True).start()
