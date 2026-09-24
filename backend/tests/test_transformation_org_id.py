"""G1 — трансформация передаёт org_id в LLM-gateway (usage/квота org-scoped).

Находка audit/jev-tobe-classifier (G1): pipeline.py вызывал gateway.complete
без org_id → usage и суточный лимит 300k токенов писались в org_default,
org-изоляция квоты фактически не работала.

Контур: fix/llm-transform-org-id-v1. Контракт шва llm_call (2-arg) НЕ меняется.
Запуск из корня репо: python -m pytest backend/tests/test_transformation_org_id.py -q
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import backend.app.ai.gateway as gw  # noqa: E402
import backend.app.ai.llm_internal_client as lic  # noqa: E402
from backend.app.transformation.pipeline import transform_asis  # noqa: E402

XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:startEvent id="E1" name="s"/>
    <bpmn:userTask id="Task_x" name="Промыть оборудование"/>
    <bpmn:endEvent id="E2" name="e"/>
    <bpmn:sequenceFlow id="F1" sourceRef="E1" targetRef="Task_x"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_x" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>
"""


@pytest.fixture()
def gateway_recorder(monkeypatch):
    """Записывает org_id всех вызовов gateway.complete; internal-client выключен."""
    calls = []
    monkeypatch.setattr(lic, "enabled", lambda: False)

    def fake_complete(feature, payload=None, **kwargs):
        calls.append({"feature": feature, "org_id": kwargs.get("org_id")})
        return {"ok": False, "status": "no_provider", "error": "test"}

    monkeypatch.setattr(gw, "complete", fake_complete)
    return calls


def test_org_id_propagates_to_gateway(gateway_recorder):
    transform_asis(XML, org_id="org_42", llm_enabled=True)
    assert gateway_recorder, "gateway.complete не был вызван"
    assert all(c["org_id"] == "org_42" for c in gateway_recorder), gateway_recorder
    assert all(c["feature"] == "as_is_transform" for c in gateway_recorder)


def test_default_org_id_is_org_default(gateway_recorder):
    """Обратная совместимость: без org_id поведение как раньше — org_default."""
    transform_asis(XML, llm_enabled=True)
    assert gateway_recorder
    assert all(c["org_id"] == "org_default" for c in gateway_recorder), gateway_recorder


def test_injected_llm_call_seam_unchanged(gateway_recorder):
    """Шов llm_call (2-arg) не тронут: org_id не ломает подмену caller'а."""
    seen = []

    def llm(system_prompt, user_prompt):
        seen.append(json.loads(user_prompt))
        return json.dumps({"matches": []})

    res = transform_asis(XML, org_id="org_42", llm_call=llm, llm_enabled=True)
    assert seen, "llm_call не был вызван"
    assert gateway_recorder == [], "при подменённом llm_call gateway дёргать нельзя"
    assert res["llm_status"] == "llm"
