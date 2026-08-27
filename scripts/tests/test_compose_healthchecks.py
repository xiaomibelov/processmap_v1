"""Smoke tests for docker-compose.yml healthchecks."""
from __future__ import annotations

import os
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPO_ROOT / "docker-compose.yml"


def test_celery_worker_has_celery_inspect_ping_healthcheck():
    assert COMPOSE_FILE.exists(), f"{COMPOSE_FILE} not found"
    with COMPOSE_FILE.open() as f:
        compose = yaml.safe_load(f)

    services = compose.get("services", {})
    assert "celery-worker" in services, "celery-worker service not found"

    healthcheck = services["celery-worker"].get("healthcheck")
    assert healthcheck is not None, "celery-worker has no healthcheck"

    test_cmd = healthcheck.get("test", [])
    assert test_cmd, "celery-worker healthcheck test is empty"

    cmd_str = " ".join(str(x) for x in test_cmd)
    assert "celery" in cmd_str, "celery-worker healthcheck should use celery command"
    assert "inspect ping" in cmd_str, "celery-worker healthcheck should use 'inspect ping'"

    assert healthcheck.get("interval") is not None
    assert healthcheck.get("timeout") is not None
    assert healthcheck.get("retries") is not None
    assert healthcheck.get("start_period") is not None
