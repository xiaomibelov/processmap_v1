import unittest
from unittest.mock import patch

import requests

from app.ai.deepseek_questions import _deepseek_chat_text


class _DummyResp:
    def __init__(self, data, status_code=200):
        self._data = data
        self.status_code = status_code

    def raise_for_status(self):
        if int(self.status_code or 0) >= 400:
            http_err = requests.exceptions.HTTPError(f"http {self.status_code}")
            http_err.response = self
            raise http_err

    def json(self):
        return self._data


class DeepseekRetryTests(unittest.TestCase):
    @patch("app.ai.deepseek_questions.time.sleep", return_value=None)
    def test_retries_on_chunked_encoding_error_then_succeeds(self, _sleep):
        calls = {"count": 0}

        def _post(*args, **kwargs):
            calls["count"] += 1
            if calls["count"] == 1:
                raise requests.exceptions.ChunkedEncodingError("Response ended prematurely")
            return _DummyResp(
                {
                    "choices": [
                        {"message": {"content": "ok text"}}
                    ]
                },
                status_code=200,
            )

        with patch("app.ai.deepseek_questions.requests.post", side_effect=_post):
            out = _deepseek_chat_text(
                api_key="x",
                base_url="https://example.invalid",
                messages=[{"role": "user", "content": "hi"}],
                timeout=1,
            )
        self.assertEqual(out, "ok text")
        self.assertEqual(calls["count"], 2)

    @patch("app.ai.deepseek_questions.time.sleep", return_value=None)
    def test_does_not_retry_on_unauthorized_http_error(self, _sleep):
        calls = {"count": 0}

        def _post(*args, **kwargs):
            calls["count"] += 1
            return _DummyResp({}, status_code=401)

        with patch("app.ai.deepseek_questions.requests.post", side_effect=_post):
            with self.assertRaises(requests.exceptions.HTTPError):
                _deepseek_chat_text(
                    api_key="x",
                    base_url="https://example.invalid",
                    messages=[{"role": "user", "content": "hi"}],
                    timeout=1,
                )
        self.assertEqual(calls["count"], 1)


if __name__ == "__main__":
    unittest.main()
