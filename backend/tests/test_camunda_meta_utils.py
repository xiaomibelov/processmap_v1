import re
import unittest

from app.camunda_meta_utils import (
    deduplicate_camunda_extension_properties,
    extract_camunda_extensions_from_bpmn_xml,
)


class TestDeduplicateCamundaExtensionProperties(unittest.TestCase):
    def test_preserves_duplicate_property_names(self):
        meta = {
            "camunda_extensions_by_element_id": {
                "Activity_1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "equipment", "value": "Весы"},
                            {"name": "equipment", "value": "Миксер"},
                            {"name": "equipment", "value": "Плита"},
                            {"name": "container", "value": "Лоток"},
                        ],
                    },
                },
            },
        }
        result = deduplicate_camunda_extension_properties(meta)
        props = result["camunda_extensions_by_element_id"]["Activity_1"]["properties"]["extensionProperties"]
        self.assertEqual(
            props,
            [
                {"name": "equipment", "value": "Весы"},
                {"name": "equipment", "value": "Миксер"},
                {"name": "equipment", "value": "Плита"},
                {"name": "container", "value": "Лоток"},
            ],
        )

    def test_preserves_case_differences(self):
        meta = {
            "camunda_extensions_by_element_id": {
                "Activity_1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "Equipment", "value": "A"},
                            {"name": "EQUIPMENT", "value": "B"},
                        ],
                    },
                },
            },
        }
        result = deduplicate_camunda_extension_properties(meta)
        props = result["camunda_extensions_by_element_id"]["Activity_1"]["properties"]["extensionProperties"]
        self.assertEqual(
            props,
            [
                {"name": "Equipment", "value": "A"},
                {"name": "EQUIPMENT", "value": "B"},
            ],
        )

    def test_empty_and_missing_names_preserved(self):
        meta = {
            "camunda_extensions_by_element_id": {
                "Activity_1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "equipment", "value": "A"},
                            {"name": "", "value": "blank"},
                            {"name": "equipment", "value": "B"},
                        ],
                    },
                },
            },
        }
        result = deduplicate_camunda_extension_properties(meta)
        props = result["camunda_extensions_by_element_id"]["Activity_1"]["properties"]["extensionProperties"]
        self.assertEqual(
            props,
            [
                {"name": "equipment", "value": "A"},
                {"name": "", "value": "blank"},
                {"name": "equipment", "value": "B"},
            ],
        )

    def test_no_camunda_extensions_unchanged(self):
        meta = {"version": 1}
        self.assertEqual(deduplicate_camunda_extension_properties(meta), meta)


class TestExtractCamundaExtensionsFromBpmnXml(unittest.TestCase):
    def test_empty_xml_returns_empty_map(self):
        self.assertEqual(extract_camunda_extensions_from_bpmn_xml(""), {})
        self.assertEqual(extract_camunda_extensions_from_bpmn_xml("   "), {})

    def test_extracts_camunda_properties(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="owner" value="ops" />
          <camunda:property name="owner" value="dev" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>"""
        result = extract_camunda_extensions_from_bpmn_xml(xml)
        task = result.get("Task_1") or {}
        props = (task.get("properties") or {}).get("extensionProperties") or []
        self.assertEqual(len(props), 2)
        self.assertEqual(props[0].get("name"), "owner")
        self.assertEqual(props[0].get("value"), "ops")
        self.assertEqual(props[1].get("value"), "dev")

    def test_extracts_execution_listener(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:executionListener event="start" class="com.example.StartListener" />
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>"""
        result = extract_camunda_extensions_from_bpmn_xml(xml)
        task = result.get("Task_1") or {}
        listeners = (task.get("properties") or {}).get("extensionListeners") or []
        self.assertEqual(len(listeners), 1)
        self.assertEqual(listeners[0].get("event"), "start")
        self.assertEqual(listeners[0].get("type"), "class")
        self.assertEqual(listeners[0].get("value"), "com.example.StartListener")

    def test_preserves_unmanaged_extension_elements(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="owner" value="ops" />
        </camunda:properties>
        <camunda:inputOutput>
          <camunda:inputParameter name="in">1</camunda:inputParameter>
        </camunda:inputOutput>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>"""
        result = extract_camunda_extensions_from_bpmn_xml(xml)
        task = result.get("Task_1") or {}
        self.assertTrue(len(task.get("preservedExtensionElements") or []) > 0)
        preserved = " ".join(task["preservedExtensionElements"])
        self.assertIn("inputOutput", preserved)

    def test_skips_pm_robot_meta(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:pm="http://processmap.ai/schema/bpmn/1.0" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <pm:RobotMeta>
          <pm:payload>{"x":1}</pm:payload>
        </pm:RobotMeta>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>"""
        result = extract_camunda_extensions_from_bpmn_xml(xml)
        self.assertEqual(result, {})


class TestExtractDedupAndStableId(unittest.TestCase):
    ZEEBE_CAMUNDA_DUP_XML = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
        'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" '
        'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_1">\n'
        '  <bpmn:process id="Process_1" isExecutable="false">\n'
        '    <bpmn:task id="Task_1">\n'
        '      <bpmn:extensionElements>\n'
        '        <zeebe:properties>\n'
        '          <zeebe:property name="ingredient" value="микс" />\n'
        '          <zeebe:property name="container_tara" value="дежа" />\n'
        '          <zeebe:property name="ingredient_shape" value="куб" />\n'
        '          <zeebe:property name="ingredient_height" value="12" />\n'
        '        </zeebe:properties>\n'
        '        <camunda:properties>\n'
        '          <camunda:property name="ingredient" value="микс" />\n'
        '          <camunda:property name="container_tara" value="дежа" />\n'
        '          <camunda:property name="ingredient_shape" value="куб" />\n'
        '          <camunda:property name="ingredient_height" value="12" />\n'
        '        </camunda:properties>\n'
        '      </bpmn:extensionElements>\n'
        '    </bpmn:task>\n'
        '  </bpmn:process>\n'
        '</bpmn:definitions>'
    )

    def test_dedups_exact_duplicates_across_camunda_and_zeebe_blocks(self):
        result = extract_camunda_extensions_from_bpmn_xml(self.ZEEBE_CAMUNDA_DUP_XML)
        props = result["Task_1"]["properties"]["extensionProperties"]
        self.assertEqual(len(props), 4)
        self.assertEqual(
            [(prop["name"], prop["value"]) for prop in props],
            [
                ("ingredient", "микс"),
                ("container_tara", "дежа"),
                ("ingredient_shape", "куб"),
                ("ingredient_height", "12"),
            ],
        )

    def test_preserves_multi_value_same_name_and_collapses_exact_duplicates(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="equipment" value="Весы" />
          <camunda:property name="equipment" value="Миксер" />
          <camunda:property name="equipment" value="Весы" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>"""
        result = extract_camunda_extensions_from_bpmn_xml(xml)
        props = result["Task_1"]["properties"]["extensionProperties"]
        self.assertEqual(
            [(prop["name"], prop["value"]) for prop in props],
            [("equipment", "Весы"), ("equipment", "Миксер")],
        )

    def test_property_id_stable_across_reparses(self):
        first = extract_camunda_extensions_from_bpmn_xml(self.ZEEBE_CAMUNDA_DUP_XML)
        second = extract_camunda_extensions_from_bpmn_xml(self.ZEEBE_CAMUNDA_DUP_XML)
        ids_first = [prop["id"] for prop in first["Task_1"]["properties"]["extensionProperties"]]
        ids_second = [prop["id"] for prop in second["Task_1"]["properties"]["extensionProperties"]]
        self.assertEqual(ids_first, ids_second)
        self.assertEqual(len(set(ids_first)), len(ids_first))


if __name__ == "__main__":
    unittest.main()
