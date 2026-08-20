"""Regression tests for AGENT-SVC internal token hardening (PM-SEC-004/M-4)."""

from __future__ import annotations

import os
from unittest import mock

import pytest


def test_startup_rejects_empty_token():
    from main import _validate_agent_token_or_die

    with mock.patch.dict(os.environ, {"AGENT_SVC_INTERNAL_TOKEN": ""}, clear=False):
        with pytest.raises(RuntimeError, match="AGENT_SVC_INTERNAL_TOKEN is not configured"):
            _validate_agent_token_or_die()


def test_startup_rejects_placeholder():
    from main import _validate_agent_token_or_die

    with mock.patch.dict(
        os.environ,
        {"AGENT_SVC_INTERNAL_TOKEN": "dev-insecure-change-me"},
        clear=False,
    ):
        with pytest.raises(RuntimeError, match="placeholder"):
            _validate_agent_token_or_die()


def test_internal_llm_rejects_unconfigured_token():
    from fastapi import HTTPException
    from routers.internal_llm import _check_internal_token

    with mock.patch.dict(os.environ, {"AGENT_SVC_INTERNAL_TOKEN": ""}, clear=False):
        with pytest.raises(HTTPException) as exc_info:
            _check_internal_token("anything")
    assert exc_info.value.status_code == 401


def test_internal_llm_rejects_placeholder_token():
    from fastapi import HTTPException
    from routers.internal_llm import _check_internal_token

    with mock.patch.dict(
        os.environ,
        {"AGENT_SVC_INTERNAL_TOKEN": "dev-insecure-change-me"},
        clear=False,
    ):
        with pytest.raises(HTTPException) as exc_info:
            _check_internal_token("dev-insecure-change-me")
    assert exc_info.value.status_code == 401
