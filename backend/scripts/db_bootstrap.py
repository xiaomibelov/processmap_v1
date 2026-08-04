#!/usr/bin/env python3
"""db_bootstrap — безопасное приведение alembic-базы к head.

Проблема (stage, 2026-07-29): база наполнялась legacy-DDL вне alembic —
таблицы есть, а alembic_version либо отсутствует, либо содержит ревизию,
которой нет в цепочке. Прямой `alembic upgrade head` в этом состоянии падает
(001 ALTER users ADD role → column exists), а слепой `stamp` опасен.

Решение: вычислить baseline по маркерным объектам схемы (самая старшая
ревизия, все маркеры которой и ниже присутствуют), `alembic stamp <baseline>`
(только если текущая ревизия отсутствует/невалидна), затем `upgrade head`.
Идемпотентно, только чтение + alembic_version + миграции.

Запуск: python backend/scripts/db_bootstrap.py /path/to/alembic.ini
Exit code: 0 — база на head; 1 — не удалось.
"""
from __future__ import annotations

import os
import subprocess
import sys

import psycopg

# линейный порядок цепочки (001→002→004→003→005→006→007→008→009→010→011)
# NB: 010/011 без маркеров — они нужны здесь, чтобы валидная alembic_version
# 010/011 НЕ считалась «невалидной» и не уводилась stamp'ом вниз до 009
# (иначе каждый рестарт api пересаживал upgrade на неидемпотентную 010 →
# column process_layer already exists → ретраи + degraded-старт).
LINEAR = ["001", "002", "004", "003", "005", "006", "007", "008", "009", "010", "011", "012"]

# маркер «объект ревизии существует» (SELECT 1 ... LIMIT 1)
MARKERS = {
    "009": "SELECT 1 FROM information_schema.columns WHERE table_name='operation_catalog' AND column_name='name_ru' LIMIT 1",
    "008": "SELECT 1 FROM recipe_param_def WHERE name='dish_sku_id' LIMIT 1",
    "007": "SELECT 1 FROM information_schema.columns WHERE table_name='sku_binding' AND column_name='pilot_kitchen_id' LIMIT 1",
    "006": "SELECT 1 FROM information_schema.tables WHERE table_name='process_template_version' LIMIT 1",
    "005": "SELECT 1 FROM information_schema.tables WHERE table_name='kitchen' LIMIT 1",
    "003": "SELECT 1 FROM information_schema.tables WHERE table_name='recipe_param_def' LIMIT 1",
    "004": "SELECT 1 FROM information_schema.tables WHERE table_name='transformation_rule' LIMIT 1",
    "002": "SELECT 1 FROM information_schema.tables WHERE table_name='process_template' LIMIT 1",
    "001": "SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role' LIMIT 1",
}


def _has(con, sql: str) -> bool:
    try:
        return con.execute(sql).fetchone() is not None
    except Exception:
        try:
            con.rollback()
        except Exception:
            pass
        return False


def _current_revision(con) -> str:
    try:
        row = con.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        return str(row[0]) if row else ""
    except Exception:
        con.rollback()
        return ""


def _compute_baseline(con) -> str:
    """Самая старшая ревизия, у которой маркер И все маркеры ниже присутствуют."""
    present = {rev: _has(con, sql) for rev, sql in MARKERS.items()}
    baseline = ""
    for rev in LINEAR:
        if present.get(rev):
            baseline = rev
        else:
            break  # дальше не идём: цепочка должна быть непрерывной
    return baseline


def main() -> int:
    ini = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "backend/alembic.ini")
    # script_location в ini — относительный (alembic) → работаем из backend/
    cwd = os.path.dirname(os.path.dirname(ini)) if ini.endswith(".ini") else "backend"
    if not os.path.isdir(os.path.join(cwd, "alembic")):
        cwd = "backend"
    url = os.environ.get("DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")
    con = psycopg.connect(url, connect_timeout=15)

    current = _current_revision(con)
    print(f"[db_bootstrap] alembic_version={current or '<empty>'}")

    if current not in LINEAR:
        baseline = _compute_baseline(con)
        if not baseline:
            print("[db_bootstrap] база пустая — миграции с нуля")
        else:
            print(f"[db_bootstrap] baseline по маркерам схемы: {baseline} → alembic stamp")
            rc = subprocess.call([sys.executable, "-m", "alembic", "-c", ini, "stamp", baseline], cwd=cwd)
            if rc != 0:
                print(f"[db_bootstrap] stamp {baseline} FAILED rc={rc}")
                return 1
    con.close()

    rc = subprocess.call([sys.executable, "-m", "alembic", "-c", ini, "upgrade", "head"], cwd=cwd)
    if rc != 0:
        print(f"[db_bootstrap] upgrade head FAILED rc={rc}")
        return 1
    print("[db_bootstrap] OK — база на head")
    return 0


if __name__ == "__main__":
    sys.exit(main())
