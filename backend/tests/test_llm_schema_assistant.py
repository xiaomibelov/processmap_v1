"""LLM3 — тесты помощника на Схеме (app.ai.schema_assistant).

Паттерн как у LLM1: session_repo.load и gateway замоканы; каталог — мок
load_catalog_from_db (живой каталог БД). Покрытие критериев:
- suggest_next: кандидаты СТРОГО из живого каталога (код вне каталога/forbidden
  → dropped); digest включает коды каталога (смена каталога = bust кэша);
  max_tokens=800;
- explain_step: шаг вне trace_map → status="no_trace" БЕЗ вызова LLM
  (решения не додумываем); запись trace пересказывается строго из trace_map
  (реальный детерминированный прогон transform_asis на golden-фикстуре);
- step_qa: шаг вне проекции → step_not_found без LLM; question обязателен;
- честные статусы гейтвея (no_provider) наружу; кривой JSON → partial.

Запуск из корня репо: python -m pytest backend/tests/test_llm_schema_assistant.py -q
"""
import json
import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.ai import schema_assistant as sa  # noqa: E402
from backend.app.models import Edge, Node, Session  # noqa: E402

FIXTURE_BPMN = os.path.join(os.path.dirname(__file__), "fixtures", "itmo_razogrev_v02.bpmn")

CATALOG = {
    "move": {"code": "move", "name": "Перемещение", "category": "logistics"},
    "check": {"code": "check", "name": "Контроль", "category": "quality"},
    "wait": {"code": "wait", "name": "Ожидание", "category": "time"},
}


def _session(with_xml: bool = False) -> Session:
    nodes = [
        Node(id="n1", type="step", title="Мойка", actor_role="operator", duration_min=10),
        Node(id="n2", type="step", title="Резка", actor_role="operator", duration_min=20),
        Node(id="n3", type="step", title="Упаковка", actor_role="technologist", duration_min=15),
    ]
    edges = [Edge(from_id="n1", to_id="n2"), Edge(from_id="n2", to_id="n3")]
    xml = ""
    if with_xml:
        with open(FIXTURE_BPMN, encoding="utf-8") as fh:
            xml = fh.read()
    return Session(id="sess_llm3", title="Тест", nodes=nodes, edges=edges,
                   bpmn_xml=xml, version=2, org_id="org_default", project_id="proj_1")


def _gw_ok(text: str, cached: bool = False) -> dict:
    return {
        "ok": True, "status": "ok", "cached": cached, "text": text,
        "usage": {"prompt_tokens": 0 if cached else 100, "completion_tokens": 0 if cached else 50},
        "provider_id": "prov_1", "model": "deepseek-v4-flash", "prompt_version": 1,
        "latency_ms": 10,
    }


@pytest.fixture
def _mock_repo():
    with mock.patch.object(sa.session_repo, "load", return_value=_session()) as m:
        yield m


@pytest.fixture
def _mock_catalog():
    with mock.patch.object(sa, "load_catalog_from_db", return_value=CATALOG) as m:
        yield m


# ── suggest_next ─────────────────────────────────────────────────────────────

SUGGEST_JSON = json.dumps({
    "candidates": [
        {"code": "move", "rationale": "перенос к следующей зоне"},
        {"code": "fly_to_moon", "rationale": "галлюцинированный код"},
        {"code": "package_meal", "rationale": "запрещённый код v0.3"},
    ],
    "note": "",
}, ensure_ascii=False)


def test_suggest_next_shape_and_catalog_filter(_mock_repo, _mock_catalog):
    with mock.patch.object(sa, "complete_cached", return_value=_gw_ok(SUGGEST_JSON)) as cc:
        resp = sa.llm_suggest_next("sess_llm3", after_step_id="n2")
    assert resp["ok"] is True and resp["status"] == "ok"
    codes = [c["code"] for c in resp["suggestions"]["candidates"]]
    assert codes == ["move"], f"кандидаты только из живого каталога: {codes}"
    assert resp["dropped"] == 2  # галлюцинированный + запрещённый
    feature, digest, payload = cc.call_args.args[:3]
    assert feature == "schema_assistant" and len(digest) == 32
    assert payload["action"] == "suggest_next"
    assert payload["after_step_id"] == "n2"
    assert {r["code"] for r in payload["operation_catalog"]} == set(CATALOG)
    assert len(payload["steps_tail"]) == 3 and "bpmn_xml" not in json.dumps(payload)
    assert cc.call_args.kwargs["max_tokens"] == 800  # жёсткий лимит ≤800


def test_suggest_next_digest_tracks_catalog(_mock_repo):
    # смена живого каталога → другой digest (кэш бьётся корректно)
    with mock.patch.object(sa, "load_catalog_from_db", return_value=CATALOG):
        with mock.patch.object(sa, "complete_cached", return_value=_gw_ok(SUGGEST_JSON)) as cc:
            sa.llm_suggest_next("sess_llm3")
            d1 = cc.call_args.args[1]
    smaller = {k: v for k, v in CATALOG.items() if k != "wait"}
    with mock.patch.object(sa, "load_catalog_from_db", return_value=smaller):
        with mock.patch.object(sa, "complete_cached", return_value=_gw_ok(SUGGEST_JSON)) as cc:
            sa.llm_suggest_next("sess_llm3")
            d2 = cc.call_args.args[1]
    assert d1 != d2


def test_suggest_next_gateway_status_and_partial(_mock_repo, _mock_catalog):
    with mock.patch.object(sa, "complete_cached",
                           return_value={"ok": False, "status": "no_provider", "error": "no enabled LLM providers with api key"}):
        resp = sa.llm_suggest_next("sess_llm3")
    assert resp["ok"] is False and resp["status"] == "no_provider"
    with mock.patch.object(sa, "complete_cached", return_value=_gw_ok("не JSON вообще")):
        resp = sa.llm_suggest_next("sess_llm3")
    assert resp["ok"] is True and resp["status"] == "partial"
    assert resp["suggestions"]["candidates"] == []


def test_suggest_next_cached_second_call(_mock_repo, _mock_catalog):
    """Bug C: повторный suggest_next на неизменной схеме → cached=true, 0/0."""
    calls = []

    def _side_effect(feature, digest, payload, **kwargs):
        calls.append(digest)
        if len(calls) == 1:
            return _gw_ok(SUGGEST_JSON, cached=False)
        return {
            "ok": True, "status": "ok", "cached": True,
            "text": SUGGEST_JSON,
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
            "provider_id": "prov_1", "model": "deepseek-v4-flash", "prompt_version": 1,
            "latency_ms": 1,
        }

    with mock.patch.object(sa, "complete_cached", side_effect=_side_effect) as cc:
        r1 = sa.llm_suggest_next("sess_llm3")
        r2 = sa.llm_suggest_next("sess_llm3")
    assert r1["cached"] is False
    assert r2["cached"] is True
    assert r2["usage"] == {"prompt_tokens": 0, "completion_tokens": 0}
    assert len(calls) == 2, "complete_cached вызван дважды с одинаковым digest"
    assert calls[0] == calls[1]


# ── explain_step ─────────────────────────────────────────────────────────────

def test_explain_step_no_trace_no_llm(_mock_repo):
    # bpmn_xml пуст, граф есть → регенерация из 3 узлов; transform на ней даст
    # trace по сгенерированным id, но НЕ по "n999" → no_trace без вызова LLM.
    with mock.patch.object(sa, "complete_cached") as cc:
        resp = sa.llm_explain_step("sess_llm3", step_id="n999")
    assert resp["ok"] is False and resp["status"] == "no_trace"
    cc.assert_not_called()  # решения не додумываем — LLM не вызывается


def test_explain_step_real_trace_from_fixture():
    # реальный детерминированный прогон transform_asis(llm_enabled=False) на
    # golden-фикстуре: запись trace существует и уходит в LLM как единственный
    # источник объяснения.
    sess = _session(with_xml=True)
    entry = sa.find_trace_entry(sess.bpmn_xml, "Activity_1k9t4a7")  # первый deterministic-элемент фикстуры
    assert entry is not None, "ожидалась запись trace_map для известного элемента фикстуры"
    assert entry.get("rule_id"), "детерминированное правило сопоставлено"
    with mock.patch.object(sa.session_repo, "load", return_value=sess):
        explain_json = json.dumps({"explanation": "Правило R: разогрев → РТК", "note": ""}, ensure_ascii=False)
        with mock.patch.object(sa, "complete_cached", return_value=_gw_ok(explain_json)) as cc:
            resp = sa.llm_explain_step("sess_llm3", step_id="Activity_1k9t4a7")
    assert resp["ok"] is True and resp["status"] == "ok"
    assert resp["explanation"] == "Правило R: разогрев → РТК"
    assert resp["trace"]["element_id"] == "Activity_1k9t4a7"
    payload = cc.call_args.args[2]
    assert payload["action"] == "explain_step"
    assert payload["trace"]["rule_id"] == entry["rule_id"]
    assert cc.call_args.kwargs["max_tokens"] == 800


# ── step_qa ──────────────────────────────────────────────────────────────────

def test_step_qa_requires_step_and_question(_mock_repo):
    assert sa.llm_step_qa("sess_llm3", step_id="", question="?")["status"] == "bad_request"
    assert sa.llm_step_qa("sess_llm3", step_id="n1", question="  ")["status"] == "bad_request"


def test_step_qa_unknown_step_no_llm(_mock_repo):
    with mock.patch.object(sa, "complete_cached") as cc:
        resp = sa.llm_step_qa("sess_llm3", step_id="n999", question="что тут?")
    assert resp["ok"] is False and resp["status"] == "step_not_found"
    cc.assert_not_called()


def test_step_qa_ok_context_neighbors(_mock_repo):
    qa_json = json.dumps({"answer": "Резка выполняется оператором 20 минут", "note": ""}, ensure_ascii=False)
    with mock.patch.object(sa, "complete_cached", return_value=_gw_ok(qa_json)) as cc:
        resp = sa.llm_step_qa("sess_llm3", step_id="n2", question="Кто выполняет резку?")
    assert resp["ok"] is True and resp["status"] == "ok"
    assert "Резка" in resp["answer"]
    payload = cc.call_args.args[2]
    assert payload["action"] == "step_qa"
    assert payload["step"]["id"] == "n2"
    dirs = sorted(n["direction"] for n in payload["neighbors"])
    assert dirs == ["next", "prev"]  # контекст = шаг + соседи, не вся схема
    assert cc.call_args.kwargs["max_tokens"] == 800


def test_step_qa_digest_tracks_question(_mock_repo):
    qa_json = json.dumps({"answer": "a", "note": ""}, ensure_ascii=False)
    with mock.patch.object(sa, "complete_cached", return_value=_gw_ok(qa_json)) as cc:
        sa.llm_step_qa("sess_llm3", step_id="n1", question="Первый вопрос?")
        d1 = cc.call_args.args[1]
        sa.llm_step_qa("sess_llm3", step_id="n1", question="Второй вопрос?")
        d2 = cc.call_args.args[1]
        # нормализация: регистр/пробелы не меняют digest
        sa.llm_step_qa("sess_llm3", step_id="n1", question="  первый   ВОПРОС? ")
        d3 = cc.call_args.args[1]
    assert d1 != d2 and d1 == d3
