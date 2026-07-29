"""E35.5 — golden-тест трансформации: AS IS (ИТМО) vs экспертный TO BE.

LLM замокан детерминированной fixture-функцией (реальный API-ключ DeepSeek
возвращает 401 — LLM-путь в этом прогоне не вызывается, т.к. все осмысленные
задачи покрываются детерминированным мэтчером; это честно отражено в отчёте).

Метрики пишутся в docs/e35/golden_report.json. Отчёт ЧЕСТНЫЙ: все расхождения
перечислены в details[], даже если проценты низкие.
"""
import json
import os
import sys
from collections import Counter

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.main import app
from backend.app.process_template.bpmn_import import parse_bpmn
from backend.app.transformation.pipeline import transform_asis

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
REPORT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "e35", "golden_report.json"))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")


def _load_fixture(name: str) -> str:
    with open(os.path.join(FIXTURES_DIR, name), "r", encoding="utf-8") as f:
        return f.read()


def _llm_fixture(system_prompt: str, user_prompt: str) -> str:
    """Детерминированный ответ вместо DeepSeek (записанный формат strict JSON)."""
    return json.dumps({"matches": []})


# Эталон решений эксперта (tobe_razogrev_supa_rtk_v03.bpmn) по каждой задаче AS IS.
# fate: transformed_to(<operation_code>) | pushed_below | open_question
EXPERT_DECISIONS = {
    "Activity_1k9t4a7": "transformed_to:get_from_storage",   # Act_get1
    "Activity_0eqhdco": "transformed_to:move",               # Act_move1
    "Activity_1spcm9y": "transformed_to:open_container",     # Act_open_c1
    "Activity_1tghc67": "transformed_to:open_equipment",     # Act_open_mw1
    "Activity_1tsk3kf": "transformed_to:move",               # Act_move2
    "Activity_1jw2q8u": "transformed_to:close_equipment",    # Act_close_mw1
    "Activity_0238wyw": "transformed_to:set_equipment",      # Act_set_mw
    "Activity_07dw2ru": "transformed_to:start_equipment",    # Act_start_mw
    "Activity_1i8s5wl": "transformed_to:get_from_storage",   # Act_get2
    "Activity_1r18m6r": "transformed_to:move",               # Act_move2c
    "Activity_1gmqktc": "transformed_to:open_equipment",     # Act_open_mw2
    "Activity_1nmuo3d": "pushed_below",                      # захват — декомпозиция move
    "Activity_0flva8y": "transformed_to:close_equipment",    # Act_close_mw3
    "Activity_171znbt": "transformed_to:transfer",           # Act_transfer
    "Activity_1vz1obl": "pushed_below",                      # открытие урны — execution_contract
    "Activity_1epghx4": "pushed_below",                      # открытие урны — execution_contract
    "Activity_12cgz6a": "transformed_to:move",               # Act_move4
    "Activity_164zb9r": "transformed_to:move",               # Act_move5
    "Activity_0eh2m0x": "transformed_to:close_container",    # Act_close_cont (запайка -> close_container)
    "Activity_1grwh4i": "transformed_to:move",               # Act_move6
    "Activity_03kv40i": "open_question",                     # безымянная задача оператора
    "Activity_0jv0gg5": "open_question",
    "Activity_020el8s": "open_question",
}

# Рецептурные проверки экспертного TO BE, которых нет в AS IS.
EXPERT_RECIPE_CHECK_OPS = {"measure_temperature", "check"}


def _compute_golden() -> dict:
    result = transform_asis(_load_fixture("itmo_razogrev_v02.bpmn"), llm_call=_llm_fixture, llm_enabled=True)
    expert = parse_bpmn(_load_fixture("tobe_razogrev_supa_rtk_v03.bpmn"))
    assert expert.report["summary"]["errors"] == 0  # сам эталон валиден

    trace = {t["element_id"]: t for t in result["trace_map"]}
    draft_nodes = {n["id"]: n for n in result["draft_ui_model"]["nodes"]}

    details = []
    matched = 0
    total = 0
    for element_id, expected in EXPERT_DECISIONS.items():
        total += 1
        entry = trace.get(element_id)
        if entry is None:
            details.append({"element_id": element_id, "expected": expected, "actual": "missing", "ok": False})
            continue
        if expected.startswith("transformed_to:"):
            expected_op = expected.split(":", 1)[1]
            actual_op = None
            if entry["fate"] == "transformed_to" and entry["draft_node_ids"]:
                actual_op = draft_nodes.get(entry["draft_node_ids"][0], {}).get("operation_code")
            ok = entry["fate"] == "transformed_to" and actual_op == expected_op
            actual = f"{entry['fate']}:{actual_op}"
        else:
            ok = entry["fate"] == expected
            actual = entry["fate"]
        if ok:
            matched += 1
        details.append(
            {
                "element_id": element_id,
                "name": entry.get("name") or "",
                "expected": expected,
                "actual": actual,
                "rule_id": entry.get("rule_id"),
                "ok": ok,
            }
        )

    # false carries: операции в draft сверх эталонного мультимножества
    expert_ops = Counter(
        n["operation_code"] for n in expert.ui_model["nodes"] if n.get("operation_code")
    )
    draft_ops = Counter(
        n["operation_code"] for n in result["draft_ui_model"]["nodes"] if n.get("operation_code")
    )
    over_carried = []
    for op, count in draft_ops.items():
        excess = count - expert_ops.get(op, 0)
        if excess > 0:
            over_carried.append({"operation_code": op, "draft": count, "expert": expert_ops.get(op, 0), "excess": excess})
    draft_task_total = sum(draft_ops.values()) or 1
    false_carries_pct = round(100.0 * sum(o["excess"] for o in over_carried) / draft_task_total, 1)

    # missed recipe checks: рецептурные проверки эксперта, отсутствующие в draft
    missed_checks = [op for op in EXPERT_RECIPE_CHECK_OPS if draft_ops.get(op, 0) < expert_ops.get(op, 0)]
    missed_recipe_checks_pct = round(100.0 * len(missed_checks) / len(EXPERT_RECIPE_CHECK_OPS), 1)

    # экспертные элементы, не выводимые из AS IS (честный список)
    expert_only = []
    for op in sorted(expert_ops):
        missing = expert_ops[op] - draft_ops.get(op, 0)
        if missing > 0:
            expert_only.append({"operation_code": op, "missing_count": missing})

    report = {
        "as_is_fixture": "itmo_razogrev_v02.bpmn",
        "to_be_fixture": "tobe_razogrev_supa_rtk_v03.bpmn",
        "llm": {
            "mode": "mocked",
            "reason": "DeepSeek API key returns 401; deterministic fixture responses used",
            "llm_status": result["llm_status"],
        },
        "matched_decisions_pct": round(100.0 * matched / total, 1),
        "false_carries_pct": false_carries_pct,
        "missed_recipe_checks_pct": missed_recipe_checks_pct,
        "draft_validation": result["validation_report"]["summary"],
        "counts": {
            "as_is_tasks": total,
            "matched": matched,
            "draft_nodes": len(result["draft_ui_model"]["nodes"]),
            "expert_nodes": len(expert.ui_model["nodes"]),
            "open_questions": len(result["open_questions"]),
        },
        "over_carried": over_carried,
        "missed_recipe_checks": missed_checks,
        "expert_only_not_derivable": expert_only,
        "details": details,
    }
    return report, result


def test_golden_transformation_report():
    report, result = _compute_golden()

    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)

    # валидатор на draft -> 0 ошибок
    assert result["validation_report"]["summary"]["errors"] == 0, result["validation_report"]["findings"]
    # структурная полнота отчёта
    assert os.path.exists(REPORT_PATH)
    assert len(report["details"]) == len(EXPERT_DECISIONS)
    # детерминированный мэтчер обязан покрывать все осмысленные задачи супа
    assert report["matched_decisions_pct"] >= 80.0, report["details"]


# ---------------------------------------------------------------------------
# API endpoint smoke (реальный PG для токена, LLM не вызывается для супа)
# ---------------------------------------------------------------------------

@pytest.fixture()
def _pg_env():
    old_env = {k: os.environ.get(k) for k in ("DATABASE_URL", "FPC_DB_BACKEND")}
    os.environ["DATABASE_URL"] = DATABASE_URL
    os.environ["FPC_DB_BACKEND"] = "postgres"
    import backend.app.storage as _st
    from backend.app.db.config import get_db_runtime_config

    get_db_runtime_config.cache_clear()
    old_pool = _st._PG_POOL
    _st._PG_POOL = None
    yield
    _st._PG_POOL = old_pool
    get_db_runtime_config.cache_clear()
    for key, value in old_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def test_transform_asis_endpoint(_pg_env):
    import uuid

    import psycopg

    from backend.app.auth import create_access_token

    user_id = uuid.uuid4().hex
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, 0, %s, 0, 0)",
                (user_id, f"e35_{user_id[:8]}@local", "technologist"),
            )
        conn.commit()
    try:
        token = create_access_token(user_id)
        client = TestClient(app)
        response = client.post(
            "/api/process-templates/transform-asis",
            content=_load_fixture("itmo_razogrev_v02.bpmn").encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "text/xml"},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["validation_report"]["summary"]["errors"] == 0
        assert payload["draft_ui_model"]["nodes"]
        assert payload["trace_map"]
        assert isinstance(payload["open_questions"], list)
        assert payload["as_is_ui_model"]["nodes"]
        # rules listing endpoint
        r2 = client.get("/api/process-templates/transformation-rules", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["count"] >= 15
    finally:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()
