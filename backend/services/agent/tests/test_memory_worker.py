"""AGENT-1: schema memory CRUD + background worker tests."""
from __future__ import annotations

import os
import sys
import uuid
from unittest import mock

import fakeredis
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from memory.schema_memory import (
    load_schema_memory,
    run_memory_worker_once,
    save_schema_memory,
    schedule_memory_update,
)


@pytest.fixture
def fake_redis():
    return fakeredis.FakeRedis(decode_responses=True)


def test_save_and_load_schema_memory(seed):
    sid = seed.make_session()
    save_schema_memory(sid, "org_default", "Summary", ["fact1"], ["dec1"], "digest1")
    row = load_schema_memory(sid, "org_default")
    assert row is not None
    assert row["summary"] == "Summary"
    assert row["facts"] == ["fact1"]
    assert row["decisions"] == ["dec1"]
    assert row["projection_digest"] == "digest1"


def test_save_upserts_unique_org_session(seed):
    sid = seed.make_session()
    save_schema_memory(sid, "org_default", "First", [], [], "d1")
    save_schema_memory(sid, "org_default", "Second", [], [], "d2")
    row = load_schema_memory(sid, "org_default")
    assert row["summary"] == "Second"
    assert row["projection_digest"] == "d2"


def test_schedule_memory_update_without_redis_does_not_crash(seed):
    sid = seed.make_session()
    with mock.patch("memory.schema_memory.get_redis_client", return_value=None):
        schedule_memory_update(sid, "org_default", "digest1", projection={"steps": []})


def test_run_memory_worker_once_processes_job(seed, fake_redis):
    sid = seed.make_session()
    projection = {"steps": [{"id": "step_1", "name_ru": "Шаг 1"}], "edges": []}
    with mock.patch("memory.schema_memory.get_redis_client", return_value=fake_redis):
        schedule_memory_update(sid, "org_default", "digest1", projection=projection)

        fake_result = {
            "ok": True,
            "status": "ok",
            "text": '{"summary": "Summary", "facts": ["f1"], "decisions": ["d1"]}',
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "provider_id": "p1",
            "model": "m",
        }
        with mock.patch("memory.schema_memory.gateway.complete", return_value=fake_result):
            processed = run_memory_worker_once(timeout_sec=1.0)

    assert processed is True
    row = load_schema_memory(sid, "org_default")
    assert row is not None
    assert row["summary"] == "Summary"
    assert row["facts"] == ["f1"]
    assert row["decisions"] == ["d1"]


def test_run_memory_worker_once_skips_empty_projection(seed, fake_redis):
    sid = seed.make_session()
    with mock.patch("memory.schema_memory.get_redis_client", return_value=fake_redis):
        schedule_memory_update(sid, "org_default", "digest1", projection={"steps": []})
        processed = run_memory_worker_once(timeout_sec=1.0)
    assert processed is True
    row = load_schema_memory(sid, "org_default")
    assert row is None
