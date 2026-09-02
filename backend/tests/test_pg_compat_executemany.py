from __future__ import annotations

from app.domains.storage.compat.repository import _PgCompatConnection


class _FakeCursor:
    description = None

    def __init__(self) -> None:
        self.calls = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params):
        self.calls.append((sql, params))
        self.rowcount = 1


class _FakeConn:
    def __init__(self) -> None:
        self.cursor_obj = _FakeCursor()

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


def test_pg_compat_executemany_translates_qmark_sql_for_each_row():
    fake = _FakeConn()
    con = _PgCompatConnection(fake)

    result = con.executemany(
        "INSERT INTO session_assignees (session_id, user_id) VALUES (?, ?)",
        [["s1", "u1"], ["s1", "u2"]],
    )

    assert result.rowcount == 2
    assert fake.cursor_obj.calls == [
        ("INSERT INTO session_assignees (session_id, user_id) VALUES (%s, %s)", ["s1", "u1"]),
        ("INSERT INTO session_assignees (session_id, user_id) VALUES (%s, %s)", ["s1", "u2"]),
    ]
