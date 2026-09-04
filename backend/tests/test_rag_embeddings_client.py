import sys
import unittest
from pathlib import Path
from unittest import mock

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import httpx

import app.rag.embeddings as emb


class _FakeResponse:
    def __init__(self, payload=None, status_exc=None):
        self._payload = payload
        self._status_exc = status_exc

    def raise_for_status(self):
        if self._status_exc is not None:
            raise self._status_exc

    def json(self):
        return self._payload


class _FakeClient:
    """Минимальный stub httpx.Client (context manager + post)."""

    instances = []

    def __init__(self, response=None, post_exc=None):
        self._response = response
        self._post_exc = post_exc
        self.post_calls = []
        self.__class__.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, json=None):
        self.post_calls.append({"url": url, "json": json})
        if self._post_exc is not None:
            raise self._post_exc
        return self._response


def _patch_client(response=None, post_exc=None):
    return mock.patch.object(emb.httpx, "Client", lambda *a, **k: _FakeClient(response, post_exc))


class EmbeddingsClientTests(unittest.TestCase):
    def setUp(self):
        self._reset_state()

    def tearDown(self):
        self._reset_state()

    def _reset_state(self):
        with emb._state_lock:
            emb._failures = 0
            emb._cooldown_until = 0.0
        _FakeClient.instances = []

    def test_success_returns_embeddings_model_and_dimensions(self):
        payload = {"embeddings": [[0.1, 0.2], [0.3, 0.4]], "model_id": "local-e5-small", "dimensions": 384}
        with _patch_client(response=_FakeResponse(payload)):
            result = emb.get_embeddings_for_texts(["текст один", "текст два"])
        self.assertIsNotNone(result)
        embeddings, model_id, dimensions = result
        self.assertEqual(embeddings, payload["embeddings"])
        self.assertEqual(model_id, "local-e5-small")
        self.assertEqual(dimensions, 384)

    def test_connection_error_returns_none_and_warns(self):
        with _patch_client(post_exc=httpx.ConnectError("boom")):
            with self.assertLogs("app.rag.embeddings", level="WARNING"):
                result = emb.get_query_embedding("запрос")
        self.assertIsNone(result)

    def test_timeout_returns_none_and_warns(self):
        with _patch_client(post_exc=httpx.ReadTimeout("slow")):
            with self.assertLogs("app.rag.embeddings", level="WARNING"):
                result = emb.get_query_embedding("запрос")
        self.assertIsNone(result)

    def test_http_500_returns_none_and_warns(self):
        status_exc = httpx.HTTPStatusError(
            "500", request=httpx.Request("POST", "http://x/embed"), response=httpx.Response(500),
        )
        with _patch_client(response=_FakeResponse(status_exc=status_exc)):
            with self.assertLogs("app.rag.embeddings", level="WARNING"):
                result = emb.get_query_embedding("запрос")
        self.assertIsNone(result)

    def test_malformed_payload_returns_none(self):
        # embeddings отсутствует
        with _patch_client(response=_FakeResponse({"model_id": "local-e5-small"})):
            with self.assertLogs("app.rag.embeddings", level="WARNING"):
                self.assertIsNone(emb.get_query_embedding("запрос"))
        # count mismatch
        payload = {"embeddings": [[0.1]], "model_id": "local-e5-small", "dimensions": 384}
        with _patch_client(response=_FakeResponse(payload)):
            with self.assertLogs("app.rag.embeddings", level="WARNING"):
                self.assertIsNone(emb.get_embeddings_for_texts(["a", "b"]))

    def test_empty_texts_returns_none_without_http(self):
        self.assertIsNone(emb.get_embeddings_for_texts([]))
        self.assertIsNone(emb.get_query_embedding(""))
        self.assertEqual(_FakeClient.instances, [])

    def test_encode_decode_roundtrip_384(self):
        from app.rag.search import _decode_vector

        original = [float(i) / 384 for i in range(384)]
        decoded = _decode_vector(emb.encode_vector(original))
        self.assertEqual(len(decoded), 384)
        for x, y in zip(original, decoded):
            self.assertAlmostEqual(x, y, places=5)

    def test_cooldown_after_three_failures_short_circuits(self):
        with _patch_client(post_exc=httpx.ConnectError("down")):
            for _ in range(3):
                self.assertIsNone(emb.get_query_embedding("q"))
        calls_after_failures = sum(len(c.post_calls) for c in _FakeClient.instances)

        # После 3 неудач — cooldown: HTTP не вызывается, сразу None.
        with _patch_client(response=_FakeResponse({"embeddings": [[0.1]], "model_id": "local-e5-small", "dimensions": 384})):
            with self.assertLogs("app.rag.embeddings", level="WARNING"):
                result = emb.get_query_embedding("q")
        self.assertIsNone(result)
        total_calls = sum(len(c.post_calls) for c in _FakeClient.instances)
        self.assertEqual(total_calls, calls_after_failures, "cooldown не должен дёргать HTTP")

    def test_success_resets_failure_counter_before_cooldown(self):
        payload = {"embeddings": [[0.1]], "model_id": "local-e5-small", "dimensions": 384}
        with _patch_client(post_exc=httpx.ConnectError("down")):
            self.assertIsNone(emb.get_query_embedding("q"))
            self.assertIsNone(emb.get_query_embedding("q"))
        self.assertEqual(emb._failures, 2)
        # Успех до порога cooldown сбрасывает счётчик.
        with _patch_client(response=_FakeResponse(payload)):
            self.assertIsNotNone(emb.get_query_embedding("q"))
        self.assertEqual(emb._failures, 0)


if __name__ == "__main__":
    unittest.main()
