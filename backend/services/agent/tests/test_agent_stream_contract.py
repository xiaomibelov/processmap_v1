"""Contract tests for AgentChatIn schema.

Ensures the /agent/stream input schema rejects unknown fields. The matching
frontend source test lives in frontend/src/features/process/processman/processmanStreamFieldContract.source.test.mjs.
"""
import pytest

from schemas import AgentChatIn


def test_agent_chat_in_rejects_unknown_fields():
    """extra='forbid' must raise on unknown payload keys (simulates 422)."""
    with pytest.raises(ValueError) as exc_info:
        AgentChatIn(question="hello", selected_node_id="n_1")
    assert "extra" in str(exc_info.value).lower() or "question" in str(exc_info.value)


def test_agent_chat_in_accepts_known_fields():
    """Known fields parse normally."""
    inp = AgentChatIn(message="hello", selected_step_id="n_1", client_turn_id="ct_1")
    assert inp.message == "hello"
    assert inp.selected_step_id == "n_1"
    assert inp.client_turn_id == "ct_1"
