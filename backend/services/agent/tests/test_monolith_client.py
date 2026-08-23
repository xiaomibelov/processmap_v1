"""Tests for monolith_client header propagation (AGENT-SVC org context)."""
from __future__ import annotations

from unittest import mock

import pytest

from runners import monolith_client


def test_headers_include_x_org_id():
    headers = monolith_client._headers("token", "org_abc")
    assert headers["Authorization"] == "Bearer token"
    assert headers["X-Org-Id"] == "org_abc"


def test_headers_omit_x_org_id_when_empty():
    headers = monolith_client._headers("token", "")
    assert headers["Authorization"] == "Bearer token"
    assert "X-Org-Id" not in headers


def test_json_headers_forward_org_id():
    headers = monolith_client._json_headers("token", "org_abc")
    assert headers["Content-Type"] == "application/json"
    assert headers["X-Org-Id"] == "org_abc"


@pytest.mark.parametrize(
    "method,func,call_args",
    [
        ("get", "get_projection", {"session_id": "s1", "token": "t", "org_id": "org_1"}),
        ("get", "search_rag", {"q": "q", "session_id": "s1", "token": "t", "org_id": "org_1"}),
        ("get", "get_operation_catalog", {"code": "op", "token": "t", "org_id": "org_1"}),
        ("get", "get_session", {"session_id": "s1", "token": "t", "org_id": "org_1"}),
        ("get", "get_session_graph", {"session_id": "s1", "token": "t", "org_id": "org_1"}),
        ("get", "get_session_bpmn", {"session_id": "s1", "token": "t", "org_id": "org_1"}),
        ("patch", "patch_session", {"session_id": "s1", "token": "t", "body": {}, "org_id": "org_1"}),
        ("post", "patch_node", {"session_id": "s1", "node_id": "n1", "token": "t", "fields": {}, "org_id": "org_1"}),
        ("post", "add_node", {"session_id": "s1", "token": "t", "node": {"id": "n1"}, "org_id": "org_1"}),
        ("delete", "delete_node", {"session_id": "s1", "node_id": "n1", "token": "t", "org_id": "org_1"}),
        ("post", "add_edge", {"session_id": "s1", "token": "t", "edge": {"from_id": "a", "to_id": "b"}, "org_id": "org_1"}),
        ("request", "delete_edge", {"session_id": "s1", "token": "t", "edge": {"from_id": "a", "to_id": "b"}, "org_id": "org_1"}),
        ("put", "bpmn_save", {"session_id": "s1", "token": "t", "xml": "<bpmn/>", "org_id": "org_1"}),
        ("post", "write_agent_edit_audit", {"session_id": "s1", "token": "t", "org_id": "org_1"}),
    ],
)
def test_all_public_methods_send_x_org_id(method, func, call_args):
    """Every monolith_client function that accepts org_id must emit X-Org-Id."""
    target = getattr(monolith_client, func)
    httpx_func = method if method != "request" else "request"
    with mock.patch(f"runners.monolith_client.httpx.{httpx_func}") as fake_httpx:
        resp = mock.MagicMock()
        resp.status_code = 200
        if func == "get_session_bpmn":
            resp.text = "<bpmn/>"
            resp.json.return_value = {"ok": True}
        else:
            resp.json.return_value = {"ok": True, "code": "op"} if func == "get_operation_catalog" else {"ok": True}
        fake_httpx.return_value = resp

        target(**call_args)

        assert fake_httpx.call_count == 1
        _, kwargs = fake_httpx.call_args
        headers = kwargs["headers"]
        assert headers["X-Org-Id"] == "org_1"


def test_create_bpmn_version_snapshot_sends_x_org_id_on_both_calls():
    """create_bpmn_version_snapshot reads BPMN then posts snapshot; both calls carry X-Org-Id."""
    with mock.patch("runners.monolith_client.httpx.get") as fake_get, mock.patch("runners.monolith_client.httpx.post") as fake_post:
        get_resp = mock.MagicMock()
        get_resp.status_code = 200
        get_resp.text = "<bpmn/>"
        fake_get.return_value = get_resp

        post_resp = mock.MagicMock()
        post_resp.status_code = 201
        post_resp.json.return_value = {"ok": True, "version_id": "v1"}
        fake_post.return_value = post_resp

        monolith_client.create_bpmn_version_snapshot("s1", "t", org_id="org_1")

        assert fake_get.call_count == 1
        assert fake_post.call_count == 1
        _, get_kwargs = fake_get.call_args
        _, post_kwargs = fake_post.call_args
        assert get_kwargs["headers"]["X-Org-Id"] == "org_1"
        assert post_kwargs["headers"]["X-Org-Id"] == "org_1"
