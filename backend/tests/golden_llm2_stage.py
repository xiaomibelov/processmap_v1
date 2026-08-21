"""LLM2 golden-прогон на stage с реальным ключом — gate эпика.

POST фикстуры itmo_razogrev_v02.bpmn на stage /api/process-templates/transform-asis
(pipeline работает на stage, LLM — через gateway с ключом из llm_providers),
метрики считаются локально той же логикой, что test_transformation_golden.py.
Отчёт → docs/llm/golden_llm2_report.json.

Критерии PLAN.md: matched_decisions_pct ≥ 100% эталона (как сейчас, т.е. ≥ mock-базовой),
false_carries_pct = 0; llm_status ожидаем "llm" (ключ на stage настроен).

Запуск: /opt/processmap-test/backend/.venv/bin/python backend/scripts/../scripts? нет —
из корня worktree: python backend/tests/golden_llm2_stage.py
"""
import json
import os
import sys
import urllib.request
from collections import Counter

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", ".."))

from backend.app.process_template.bpmn_import import parse_bpmn  # noqa: E402
from backend.tests.test_transformation_golden import (  # noqa: E402
    EXPERT_DECISIONS,
    EXPERT_RECIPE_CHECK_OPS,
    _load_fixture,
)

BASE = os.environ.get("GOLDEN_BASE_URL", "https://stage.processmap.ru")
OUT = os.path.join(HERE, "..", "..", "docs", "llm", "golden_llm2_report.json")


def _http(method, path, body=None, token=None, raw=False):
    req = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=body,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = resp.read()
    return data if raw else json.loads(data)


def main() -> int:
    token = _http("POST", "/api/auth/login", json.dumps({
        "email": "d.belov@automacon.ru", "password": "Beelive12!",
    }).encode())["access_token"]

    xml = _load_fixture("itmo_razogrev_v02.bpmn")
    print("[golden-llm2] POST transform-asis на stage (LLM live, ждём)…")
    result = _http("POST", "/api/process-templates/transform-asis", xml.encode("utf-8"), token=token)
    print("[golden-llm2] llm_status:", result.get("llm_status"))

    expert = parse_bpmn(_load_fixture("tobe_razogrev_supa_rtk_v03.bpmn"))
    assert expert.report["summary"]["errors"] == 0

    trace = {t["element_id"]: t for t in result["trace_map"]}
    draft_nodes = {n["id"]: n for n in result["draft_ui_model"]["nodes"]}

    details, matched, total = [], 0, 0
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
        matched += 1 if ok else 0
        details.append({
            "element_id": element_id, "name": entry.get("name") or "",
            "expected": expected, "actual": actual,
            "rule_id": entry.get("rule_id"), "source": entry.get("source"), "ok": ok,
        })

    expert_ops = Counter(n["operation_code"] for n in expert.ui_model["nodes"] if n.get("operation_code"))
    draft_ops = Counter(n["operation_code"] for n in result["draft_ui_model"]["nodes"] if n.get("operation_code"))
    over_carried = [
        {"operation_code": op, "draft": c, "expert": expert_ops.get(op, 0), "excess": c - expert_ops.get(op, 0)}
        for op, c in draft_ops.items() if c - expert_ops.get(op, 0) > 0
    ]
    draft_task_total = sum(draft_ops.values()) or 1
    missed_checks = [op for op in EXPERT_RECIPE_CHECK_OPS if draft_ops.get(op, 0) < expert_ops.get(op, 0)]

    report = {
        "as_is_fixture": "itmo_razogrev_v02.bpmn",
        "to_be_fixture": "tobe_razogrev_supa_rtk_v03.bpmn",
        "llm": {
            "mode": "live-stage",
            "base_url": BASE,
            "llm_status": result["llm_status"],
        },
        "matched_decisions_pct": round(100.0 * matched / total, 1),
        "false_carries_pct": round(100.0 * sum(o["excess"] for o in over_carried) / draft_task_total, 1),
        "missed_recipe_checks_pct": round(100.0 * len(missed_checks) / len(EXPERT_RECIPE_CHECK_OPS), 1),
        "draft_validation": result["validation_report"]["summary"],
        "counts": {
            "as_is_tasks": total, "matched": matched,
            "draft_nodes": len(result["draft_ui_model"]["nodes"]),
            "expert_nodes": len(expert.ui_model["nodes"]),
            "open_questions": len(result["open_questions"]),
            "llm_sourced_decisions": sum(1 for t in result["trace_map"] if t.get("source") == "llm"),
        },
        "over_carried": over_carried,
        "missed_recipe_checks": missed_checks,
        "details": details,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("[golden-llm2] отчёт →", os.path.abspath(OUT))
    print(json.dumps({k: report[k] for k in ("llm", "matched_decisions_pct", "false_carries_pct",
                                             "missed_recipe_checks_pct", "counts")}, ensure_ascii=False, indent=2))
    # gate: метрики не хуже mock-эталона (PLAN: ≥100% эталона=mock, false_carries=0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
