import threading
import unittest
from unittest.mock import patch
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _FakeRedis:
    def __init__(self):
        self._values = {}
        self._lock = threading.Lock()

    def set(self, key, value, nx=False, px=None):
        _ = px
        with self._lock:
            if nx and key in self._values:
                return False
            self._values[key] = value
            return True

    def eval(self, script, numkeys, key, token):
        _ = script
        _ = numkeys
        with self._lock:
            if self._values.get(key) == token:
                self._values.pop(key, None)
                return 1
            return 0


class _BrokenRedis:
    def set(self, *args, **kwargs):
        _ = args
        _ = kwargs
        raise RuntimeError("redis down")

    def eval(self, *args, **kwargs):
        _ = args
        _ = kwargs
        return 0


class RedisLockTests(unittest.TestCase):
    def test_acquire_conflict_and_release_with_mock_redis(self):
        from app.redis_lock import acquire_session_lock

        fake = _FakeRedis()
        with patch("app.redis_lock.get_client", return_value=fake):
            first = acquire_session_lock("sess-1", ttl_ms=15000)
            self.assertTrue(first.acquired)
            self.assertFalse(first.bypass)

            second = acquire_session_lock("sess-1", ttl_ms=15000)
            self.assertFalse(second.acquired)
            self.assertFalse(second.bypass)

            self.assertTrue(first.release())

            third = acquire_session_lock("sess-1", ttl_ms=15000)
            self.assertTrue(third.acquired)
            self.assertFalse(third.bypass)
            self.assertTrue(third.release())

    def test_fallback_when_redis_client_missing(self):
        from app.redis_lock import acquire_session_lock

        with patch("app.redis_lock.get_client", return_value=None):
            lock = acquire_session_lock("sess-2")
            self.assertTrue(lock.acquired)
            self.assertTrue(lock.bypass)
            self.assertTrue(lock.release())

    def test_fallback_when_redis_is_unavailable(self):
        from app.redis_lock import acquire_session_lock

        with patch("app.redis_lock.get_client", return_value=_BrokenRedis()):
            lock = acquire_session_lock("sess-3")
            self.assertTrue(lock.acquired)
            self.assertTrue(lock.bypass)
            self.assertTrue(lock.release())


if __name__ == "__main__":
    unittest.main()
