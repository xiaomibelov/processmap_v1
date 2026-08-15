"""Rate-limited endpoints must document 429 in the OpenAPI schema.

CI backend-contract nightly failed with UndefinedStatusCode on
POST /api/auth/login: the login handler legitimately returns 429
(RL_LOGIN_PER_MIN), but the schema documented only 200/401/422.
"""
from app.main import app


RATE_LIMITED_ROUTES = [
    ("post", "/api/auth/login"),
    ("post", "/api/invite/activate"),
    ("post", "/api/auth/invite/activate"),
    ("post", "/api/admin/organizations/{org_id}/invites"),
    ("post", "/api/orgs/{org_id}/invites"),
    ("post", "/api/orgs/{org_id}/invites/accept"),
    ("post", "/api/invites/accept"),
]


def test_rate_limited_endpoints_document_429():
    schema = app.openapi()
    for method, path in RATE_LIMITED_ROUTES:
        operation = schema["paths"][path][method]
        assert "429" in operation.get("responses", {}), f"{method.upper()} {path} misses documented 429"
