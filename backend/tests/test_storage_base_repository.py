"""Characterization tests for storage/base.py generic CRUD layer.

Pure sqlite (in-memory) — no app DB bootstrap required. These tests pin the
behaviour that domain repositories rely on when delegating to base helpers.
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from app.domains.storage import base


@pytest.fixture()
def con():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute(
        "CREATE TABLE item ("
        "id TEXT PRIMARY KEY, org_id TEXT, name TEXT, meta_json TEXT, "
        "ts INTEGER, deleted_at INTEGER DEFAULT 0)"
    )
    connection.commit()
    return connection


def _seed(con, **overrides):
    row = {
        "id": "it_1", "org_id": "org_1", "name": "alpha",
        "meta_json": '{"a": 1}', "ts": 100, "deleted_at": 0,
    }
    row.update(overrides)
    cols = ", ".join(row)
    con.execute(
        f"INSERT INTO item ({cols}) VALUES ({', '.join('?' for _ in row)})",
        list(row.values()),
    )
    con.commit()
    return row


# --- identifiers -----------------------------------------------------------


def test_check_ident_accepts_plain_and_rejects_injection():
    assert base.check_ident("note_threads") == "note_threads"
    with pytest.raises(ValueError):
        base.check_ident("x; DROP TABLE")
    with pytest.raises(ValueError):
        base.check_ident("1abc")
    with pytest.raises(ValueError):
        base.check_ident("has space")
    with pytest.raises(ValueError):
        base.build_where({"a = 1 OR 1": "x"})


# --- ids / time ------------------------------------------------------------


def test_gen_id_format():
    assert len(base.gen_id()) == 12
    assert base.gen_id("aud_").startswith("aud_")
    assert len(base.gen_id("aud_")) == 16
    assert base.gen_id() != base.gen_id()


def test_now_ts_is_int_epoch():
    assert isinstance(base.now_ts(), int)
    assert base.now_ts() > 1_700_000_000


# --- row_to_dict ------------------------------------------------------------


def test_row_to_dict_plain():
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE t (id TEXT, meta_json TEXT)")
    con.execute("INSERT INTO t VALUES ('a', '{\"k\": 2}')")
    row = con.execute("SELECT * FROM t").fetchone()
    assert base.row_to_dict(row) == {"id": "a", "meta_json": '{"k": 2}'}


def test_row_to_dict_json_cols_rename_and_parse():
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE t (id TEXT, meta_json TEXT)")
    con.execute("INSERT INTO t VALUES ('a', '{\"k\": 2}')")
    row = con.execute("SELECT * FROM t").fetchone()
    payload = base.row_to_dict(row, json_cols={"meta_json": "meta"})
    assert payload == {"id": "a", "meta": {"k": 2}}


def test_row_to_dict_json_cols_fallback_on_bad_json():
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE t (id TEXT, meta_json TEXT)")
    con.execute("INSERT INTO t VALUES ('a', 'not-json')")
    row = con.execute("SELECT * FROM t").fetchone()
    payload = base.row_to_dict(row, json_cols={"meta_json": "meta"})
    assert payload == {"id": "a", "meta": None}


def test_row_to_dict_json_cols_missing_source_kept():
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE t (id TEXT)")
    con.execute("INSERT INTO t VALUES ('a')")
    row = con.execute("SELECT * FROM t").fetchone()
    assert base.row_to_dict(row, json_cols={"meta_json": "meta"}) == {"id": "a"}


# --- build_where ------------------------------------------------------------


def test_build_where_order_deterministic():
    where, params = base.build_where(
        {"id": "x"},
        org_id="o1",
        soft_delete=True,
        range_cols={"ts": (10, 20)},
        like_cols={"name": "%a%"},
    )
    assert where == (
        " WHERE id = ? AND org_id = ? AND deleted_at = 0"
        " AND ts >= ? AND ts <= ? AND name LIKE ?"
    )
    assert params == ["x", "o1", 10, 20, "%a%"]


def test_build_where_empty():
    assert base.build_where() == ("", [])


def test_build_where_org_required_enforced():
    with pytest.raises(ValueError):
        base.build_where({}, org_required=True)
    where, params = base.build_where({}, org_required=True, org_id="o")
    assert where == " WHERE org_id = ?"
    assert params == ["o"]


# --- CRUD -------------------------------------------------------------------


def test_insert_and_get_by_id(con):
    base.insert(con, "item", {"id": "a", "org_id": "o", "name": "n", "ts": 5})
    row = base.get_by_id(con, "item", "id", "a")
    assert row["name"] == "n"
    assert row["deleted_at"] == 0


def test_get_by_id_org_scope(con):
    _seed(con, id="a", org_id="o1")
    assert base.get_by_id(con, "item", "id", "a", org_id="o1")["id"] == "a"
    assert base.get_by_id(con, "item", "id", "a", org_id="o2") is None


def test_get_by_id_soft_delete(con):
    _seed(con, id="a", deleted_at=123)
    assert base.get_by_id(con, "item", "id", "a") is not None
    assert base.get_by_id(con, "item", "id", "a", soft_delete=True) is None


def test_get_by_id_mapper(con):
    _seed(con, id="a")
    payload = base.get_by_id(
        con, "item", "id", "a", mapper=lambda r: {"mapped": r["id"]}
    )
    assert payload == {"mapped": "a"}


def test_reselect_after_insert(con):
    base.insert(con, "item", {"id": "a", "meta_json": '{"x": 1}'})
    row = base.reselect(
        con, "item", "id", "a", mapper=lambda r: base.row_to_dict(
            r, json_cols={"meta_json": "meta"}
        )
    )
    assert row["meta"] == {"x": 1}


def test_update_fields(con):
    _seed(con, id="a", ts=1)
    n = base.update_fields(con, "item", {"name": "beta", "ts": 9}, {"id": "a"})
    assert n == 1
    assert base.get_by_id(con, "item", "id", "a")["name"] == "beta"


def test_update_fields_empty_is_noop(con):
    _seed(con, id="a")
    assert base.update_fields(con, "item", {}, {"id": "a"}) == 0


def test_update_fields_requires_where(con):
    with pytest.raises(ValueError):
        base.update_fields(con, "item", {"name": "x"}, {})


def test_hard_delete(con):
    _seed(con, id="a")
    assert base.hard_delete(con, "item", {"id": "a"}) is True
    assert base.hard_delete(con, "item", {"id": "a"}) is False


def test_list_page_and_count(con):
    for i in range(5):
        _seed(con, id=f"i{i}", ts=i)
    rows = base.list_page(con, "item", where=" WHERE deleted_at = 0", order_by="ts",
                          order_dir="DESC", limit=2, offset=1)
    assert [r["id"] for r in rows] == ["i3", "i2"]
    rows = base.list_page(con, "item", order_by="ts", order_dir="ASC", limit=10)
    assert [r["id"] for r in rows] == ["i0", "i1", "i2", "i3", "i4"]
    assert base.count(con, "item") == 5


def test_list_page_invalid_direction_falls_back_desc(con):
    _seed(con, id="a", ts=1)
    _seed(con, id="b", ts=2)
    rows = base.list_page(con, "item", order_by="ts", order_dir="bogus; DROP", limit=10)
    assert rows[0]["id"] == "b"
