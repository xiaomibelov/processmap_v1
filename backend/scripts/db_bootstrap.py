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
LINEAR = ["001", "002", "004", "003", "005", "006", "007", "008", "009", "010", "011", "012", "013", "014", "015"]

# маркер «объект ревизии существует» (SELECT 1 ... LIMIT 1)
MARKERS = {
    # LLM3: маркер 015 — сид-промт schema_assistant (data-маркер).
    "015": "SELECT 1 FROM llm_prompts WHERE feature='schema_assistant' LIMIT 1",
    # LLM2: маркер 014 — сид-промт as_is_transform (data-маркер).
    "014": "SELECT 1 FROM llm_prompts WHERE feature='as_is_transform' LIMIT 1",
    # LLM1: маркер 013 — сид-промт process_analysis (data-маркер).
    "013": "SELECT 1 FROM llm_prompts WHERE feature='process_analysis' LIMIT 1",
    # F2: маркеры 010/011/012 — baseline по реальному состоянию схемы.
    # 010: колонки добавляются рантаймом вне alembic (storage._ensure_schema),
    # поэтому stamped-down база с рабочей схемой детектится корректно.
    "012": "SELECT 1 FROM information_schema.tables WHERE table_name='llm_providers' LIMIT 1",
    "011": "SELECT 1 FROM pg_indexes WHERE indexname='idx_sessions_natural_key_unique' LIMIT 1",
    "010": "SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='process_layer' LIMIT 1",
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
            # Прямая запись alembic_version вместо `alembic stamp`: CLI-штамп
            # резолвит ТЕКУЩУЮ ревизию и падает на значениях вне цепочки
            # («Can't locate revision identified by 'bogus…'») — а именно для
            # таких состояний baseline и существует.
            print(f"[db_bootstrap] baseline по маркерам схемы: {baseline} → alembic_version (прямая запись)")
            try:
                con.execute(
                    "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"
                )
                con.execute("DELETE FROM alembic_version")
                con.execute("INSERT INTO alembic_version (version_num) VALUES (%s)", (baseline,))
                con.commit()
            except Exception as exc:
                try:
                    con.rollback()
                except Exception:
                    pass
                print(f"[db_bootstrap] stamp {baseline} FAILED: {exc}")
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
