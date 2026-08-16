"""_table_exists: PG-путь не должен травить транзакцию.

Root cause (fresh install, 2026-08-17): на пустой PostgreSQL
`_table_exists(con, "admin_entity_permissions")` из `_ensure_schema`
делал `SELECT 1 FROM <table>` → UndefinedTable → транзакция abort'илась,
и весь дальнейший DDL падал с InFailedSqlTransaction (crash-loop api).
Фикс: на PG проверка через information_schema (не бросает), SQLite-путь
без изменений.
"""
from __future__ import annotations

import sqlite3

from app import storage as st


class _FakePg(st._PgCompatConnection):
    """_PgCompatConnection без реального psycopg-соединения.

    execute записывает SQL; эмулирует PG-семантику: любой SELECT по
    несуществующей таблице бросил бы UndefinedTable — здесь мы проверяем,
    что _table_exists вообще не ходит таким запросом.
    """

    def __init__(self) -> None:  # noqa: D107 — сознательно без super()
        self.queries: list[str] = []

    def execute(self, query, params=None):  # noqa: ANN001, ANN201, ANN202
        sql = " ".join(str(query).split())
        self.queries.append(sql)
        assert "FROM admin_entity_permissions LIMIT 1" not in sql, (
            "PG-путь _table_exists обязан идти через information_schema, "
            "а не SELECT 1 FROM <table> (ломает транзакцию на свежей БД)"
        )

        class _Res:
            def fetchall(self):  # noqa: ANN202
                return []

        return _Res()


def test_table_exists_pg_missing_table_does_not_throw_probe() -> None:
    con = _FakePg()
    assert st._table_exists(con, "admin_entity_permissions") is False
    assert con.queries, "ожидался хотя бы один probing-запрос"
    assert any("information_schema" in q for q in con.queries)


def test_table_exists_sqlite_still_works() -> None:
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE demo (id TEXT)")
    assert st._table_exists(con, "demo") is True
    assert st._table_exists(con, "no_such_table") is False
    # SQLite-путь: после промаха соединение остаётся рабочим.
    con.execute("CREATE TABLE after_miss (id TEXT)")
    con.close()
