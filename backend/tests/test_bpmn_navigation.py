import pytest

from app.services.bpmn_navigation import assert_unique_element_id, get_element_name


def _sample_xml(name: str | None = "Outer Process") -> str:
    n = f' name="{name}"' if name else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"{n}>
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Task_1" />
    <bpmn:subProcess id="SubProcess_1" name="Make dough">
      <bpmn:startEvent id="StartEvent_2" name="Inner start" />
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>
"""


def test_get_element_name_returns_name():
    xml = _sample_xml()
    assert get_element_name(xml, "Process_1") == "Outer Process"
    assert get_element_name(xml, "SubProcess_1") == "Make dough"
    assert get_element_name(xml, "StartEvent_1") == "Start"


def test_get_element_name_returns_none_when_missing():
    xml = _sample_xml()
    assert get_element_name(xml, "Missing_1") is None


def test_get_element_name_returns_none_for_unnamed_element():
    xml = _sample_xml()
    assert get_element_name(xml, "Task_1") is None


def test_get_element_name_returns_none_for_empty_xml():
    assert get_element_name("", "Process_1") is None


def test_get_element_name_handles_whitespace_name():
    xml = _sample_xml(name="  ")
    assert get_element_name(xml, "Process_1") is None


def test_assert_unique_element_id_passes_when_unique():
    xml = _sample_xml()
    assert_unique_element_id(xml, "SubProcess_1")  # does not raise


def test_assert_unique_element_id_raises_on_duplicate():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:subProcess id="SubProcess_1" name="First" />
    <bpmn:subProcess id="SubProcess_1" name="Duplicate" />
  </bpmn:process>
</bpmn:definitions>
"""
    with pytest.raises(ValueError) as exc_info:
        assert_unique_element_id(xml, "SubProcess_1")
    assert "not unique" in str(exc_info.value)
    assert "2 occurrences" in str(exc_info.value)


def test_assert_unique_element_id_is_noop_for_empty_inputs():
    assert_unique_element_id("", "SubProcess_1")  # does not raise
    assert_unique_element_id(_sample_xml(), "")  # does not raise
