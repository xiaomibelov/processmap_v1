import time
from unittest.mock import patch

import pytest
import redis
import fakeredis

from app import overlay_cache
from app.overlay_cache import get_overlay, invalidate_overlay, _enc, _k, _lk, pg_cb
from app.celery_app import app as celery_app


@pytest.fixture(autouse=True)
def fake_redis():
    fake = fakeredis.FakeRedis(decode_responses=False)
    overlay_cache.r = fake
    yield fake


@pytest.fixture(autouse=True)
def celery_eager():
    celery_app.conf.task_always_eager = True
    with patch.object(overlay_cache, "render_svg", return_value="<svg/>"):
        with patch.object(overlay_cache, "fetch_session_bpmn", return_value="<bpmn/>"):
            with patch.object(overlay_cache, "fetch_annotations", return_value=[]):
                yield


@pytest.fixture(autouse=True)
def reset_breaker():
    pg_cb._calls.clear()
    pg_cb._open_until = 0.0


def _seed(fake, sid, ver, qx, qy, qs, xml):
    fake.set(
        _k(sid, ver, qx, qy, qs),
        _enc({"xml": xml, "fresh_until": time.time() + 60, "stale_until": time.time() + 90}),
        ex=90,
    )


def test_cache_hit(fake_redis):
    _seed(fake_redis, "s1", 0, 0, 0, 10, "<svg/>")
    res = get_overlay("s1", 1.0, 0, 0)
    assert res.status == 200
    assert res.body == "<svg/>"


def test_cache_miss_enqueue(fake_redis):
    res = get_overlay("s1", 1.0, 0, 0)
    assert res.status == 202
    assert "poll_url" in res.body
    assert fake_redis.get(_lk("s1", 0, 0, 0, 10)) is not None


def test_cache_stampede(fake_redis):
    from app import tasks
    with patch.object(tasks.render_overlay_task, "delay") as mock_delay:
        results = [get_overlay("s1", 1.0, 0, 0) for _ in range(5)]
    assert mock_delay.call_count == 1
    assert sum(1 for r in results if r.status == 202) == 1
    assert sum(1 for r in results if r.status == 503) == 4


def test_invalidate(fake_redis):
    _seed(fake_redis, "s1", 0, 0, 0, 10, "<svg/>")
    invalidate_overlay("s1")
    assert int(fake_redis.get("pm:{s1}:ver") or 0) == 1
    assert fake_redis.get(_k("s1", 0, 0, 0, 10)) is not None
    assert get_overlay("s1", 1.0, 0, 0).status == 202


def test_circuit_breaker_redis_down(fake_redis):
    fake_redis.get = lambda *a, **k: (_ for _ in ()).throw(redis.RedisError("down"))
    fake_redis.set = lambda *a, **k: (_ for _ in ()).throw(redis.RedisError("down"))
    assert get_overlay("s1", 1.0, 0, 0).status == 200
    with patch.object(overlay_cache, "render_svg", side_effect=Exception("fail")):
        with patch.object(pg_cb, "_open_until", float("inf")):
            res = get_overlay("s1", 1.0, 0, 0)
            assert res.status == 200
            assert res.body.get("wireframe") is True
        pg_cb._open_until = 0.0
        assert get_overlay("s1", 1.0, 0, 0).status == 503


def test_render_timeout(fake_redis):
    with patch.object(overlay_cache, "render_svg", side_effect=lambda *_: (time.sleep(1) or "<svg/>")):
        res = get_overlay("s1", 1.0, 0, 0)
    assert res.status == 202
    ttl = fake_redis.ttl(_lk("s1", 0, 0, 0, 10))
    assert 0 < ttl <= 10
