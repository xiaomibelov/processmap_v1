import unittest

from starlette.requests import Request


def make_request(path: str, query_string: bytes = b"", headers: list | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string": query_string,
            "headers": headers or [],
        }
    )


class BearerAuthorizationFromRequestTest(unittest.TestCase):
    def test_header_wins_for_any_path(self):
        from app.startup.middleware import bearer_authorization_from_request

        request = make_request(
            "/api/sessions",
            headers=[(b"authorization", b"Bearer header-token")],
        )
        self.assertEqual(bearer_authorization_from_request(request), "Bearer header-token")

    def test_query_param_accepted_for_sse_events_path(self):
        from app.startup.middleware import bearer_authorization_from_request

        request = make_request(
            "/api/sessions/abc123/events",
            query_string=b"access_token=query-token",
        )
        self.assertEqual(bearer_authorization_from_request(request), "Bearer query-token")

    def test_query_param_ignored_for_non_events_path(self):
        from app.startup.middleware import bearer_authorization_from_request

        request = make_request(
            "/api/sessions/abc123",
            query_string=b"access_token=query-token",
        )
        self.assertEqual(bearer_authorization_from_request(request), "")

    def test_missing_credentials_returns_empty(self):
        from app.startup.middleware import bearer_authorization_from_request

        request = make_request("/api/sessions/abc123/events")
        self.assertEqual(bearer_authorization_from_request(request), "")


if __name__ == "__main__":
    unittest.main()
