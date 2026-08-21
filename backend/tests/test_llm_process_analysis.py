"""LLM1 — тесты эндпоинта/хендлера llm_process_analysis (app.ai.process_analysis).

Паттерн: без БД — session_repo.load и gateway-вызовы замоканы; сессия —
реальная модель Session. Покрытие критериев PLAN.md:
- shape ответа (ok/partial/ошибки гейтвея);
- повтор неизменной схемы → complete_cached (cached=true, 0 токенов — контракт);
- ?force=1 → complete (обход кэша);
- кривой JSON от LLM → status "partial", НЕ падение;
- галлюцинированные step_id/operation_code отброшены (dropped);
- 404 на чужую/отсутствующую сессию; роут зарегистрирован.

Запуск из корня репо: python -m pytest backend/tests/test_llm_process_analysis.py -q
"""
import json
import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.ai import process_analysis as pa  # noqa: E402
from backend.app.models import Edge, Node, Session  # noqa: E402


def _session() -> Session:
    nodes = [
        Node(id="n1", type="step", title="Мойка", actor_role="operator", duration_min=10),
        Node(id="n2", type="step", title="Резка", actor_role="operator", duration_min=20),
        Node(id="n3", type="step", title="Упаковка", actor_role="technologist", duration_min=15),
    ]
    edges = [Edge(from_id="n1", to_id="n2"), Edge(from_id="n2", to_id="n3")]
    return Session(id="sess_llm1", title="Тест", nodes=nodes, edges=edges,
                   version=2, org_id="org_default", project_id="proj_1")


def _gw_ok(text: str, cached: bool = False) -> dict:
    return {
        "ok": True, "status": "ok", "cached": cached, "text": text,
        "usage": {"prompt_tokens": 0 if cached else 100, "completion_tokens": 0 if cached else 50},
        "provider_id": "prov_1", "model": "deepseek-chat", "prompt_version": 1,
        "latency_ms": 10,
    }


VALID_LLM_JSON = json.dumps({
    "bottlenecks": [
        {"step_id": "n2", "reason": "долгая операция", "severity": "high"},
        {"step_id": "n_hallucinated", "reason": "выдуманный шаг", "severity": "low"},
    ],
    "robotization_candidates": [
        {"step_id": "n1", "operation_code": "move", "rationale": "ручной перенос"},
        {"step_id": "n3", "operation_code": "package_meal", "rationale": "запрещённый код"},
        {"step_id": "n3", "operation_code": "fly_to_moon", "rationale": "код вне каталога"},
    ],
    "risks": [{"text": "нет контроля температуры", "severity": "medium"}],
    "open_questions": [{"text": "кто отвечает за санобработку?"}],
}, ensure_ascii=False)


@pytest.fixture
def _mock_repo():
    with mock.patch.object(pa.session_repo, "load", return_value=_session()) as m:
        yield m


def test_shape_ok(_mock_repo):
    with mock.patch.object(pa, "complete_cached", return_value=_gw_ok(VALID_LLM_JSON)) as cc:
        resp = pa.llm_process_analysis("sess_llm1")
    assert resp["ok"] is True and resp["status"] == "ok"
    assert set(resp.keys()) == {
        "ok", "status", "analysis", "dropped", "session_id", "digest", "nodes_count",
        "cached", "usage", "provider_id", "model", "prompt_version",
    }
    assert set(resp["analysis"].keys()) == {
        "bottlenecks", "robotization_candidates", "risks", "open_questions",
    }
    assert resp["nodes_count"] == 3 and len(resp["digest"]) == 32
    # гейтвей вызван с feature=process_analysis и проекцией (не сырым XML)
    feature, digest, payload = cc.call_args.args[:3]
    assert feature == "process_analysis" and len(digest) == 32
    assert "steps" in payload and "bpmn_xml" not in json.dumps(payload)
    assert cc.call_args.kwargs["max_tokens"] == 4000


def test_antihallucination_filter(_mock_repo):
    with mock.patch.object(pa, "complete_cached", return_value=_gw_ok(VALID_LLM_JSON)):
        resp = pa.llm_process_analysis("sess_llm1")
    a = resp["analysis"]
    assert [b["step_id"] for b in a["bottlenecks"]] == ["n2"]
    assert [r["operation_code"] for r in a["robotization_candidates"]] == ["move"]
    assert resp["dropped"] == 3  # шаг-призрак + package_meal + fly_to_moon
    assert a["risks"] == [{"text": "нет контроля температуры", "severity": "medium"}]
    assert a["open_questions"] == [{"text": "кто отвечает за санобработку?"}]


def test_repeat_uses_cache_zero_tokens(_mock_repo):
    """Повтор неизменной схемы: гейтвей отвечает cached=true, usage=0 — контракт проходит наружу."""
    with mock.patch.object(pa, "complete_cached", return_value=_gw_ok(VALID_LLM_JSON, cached=True)):
        resp = pa.llm_process_analysis("sess_llm1")
    assert resp["cached"] is True
    assert resp["usage"] == {"prompt_tokens": 0, "completion_tokens": 0}


def test_force_bypasses_cache(_mock_repo):
    with mock.patch.object(pa, "complete", return_value=_gw_ok(VALID_LLM_JSON)) as c, \
         mock.patch.object(pa, "complete_cached") as cc:
        resp = pa.llm_process_analysis("sess_llm1", force=1)
    assert c.called and not cc.called
    assert resp["cached"] is False


def test_malformed_json_is_partial_not_crash(_mock_repo):
    garbage = "Очень содержательный ответ, но без JSON вообще"
    with mock.patch.object(pa, "complete_cached", return_value=_gw_ok(garbage)):
        resp = pa.llm_process_analysis("sess_llm1")
    assert resp["ok"] is True and resp["status"] == "partial"
    assert resp["analysis"] == {
        "bottlenecks": [], "robotization_candidates": [], "risks": [], "open_questions": [],
    }
    assert resp["raw_excerpt"].startswith("Очень содержательный")


def test_fenced_json_parsed(_mock_repo):
    fenced = "```json\n" + VALID_LLM_JSON + "\n```"
    with mock.patch.object(pa, "complete_cached", return_value=_gw_ok(fenced)):
        resp = pa.llm_process_analysis("sess_llm1")
    assert resp["status"] == "ok"
    assert len(resp["analysis"]["bottlenecks"]) == 1


def test_gateway_failure_status_passthrough(_mock_repo):
    for status in ("disabled", "rate_limited", "no_provider", "error"):
        with mock.patch.object(pa, "complete_cached",
                               return_value={"ok": False, "status": status, "error": "x"}):
            resp = pa.llm_process_analysis("sess_llm1")
        assert resp["ok"] is False and resp["status"] == status
        assert resp["cached"] is False and resp["digest"]


def test_session_not_found_404():
    from fastapi import HTTPException

    with mock.patch.object(pa.session_repo, "load", return_value=None):
        with pytest.raises(HTTPException) as exc:
            pa.llm_process_analysis("sess_missing")
    assert exc.value.status_code == 404


def test_route_registered():
    from backend.app.main import app

    paths = {
        (r.path, tuple(sorted(r.methods or ())))
        for r in app.routes
        if hasattr(r, "methods") and getattr(r, "path", None)
    }
    assert ("/api/sessions/{session_id}/llm/analysis", ("POST",)) in paths
