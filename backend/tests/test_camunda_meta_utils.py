import re
import unittest
from pathlib import Path

from app.camunda_meta_utils import (
    deduplicate_camunda_extension_properties,
    detect_camunda_namespace_divergence,
    extract_camunda_extensions_from_bpmn_xml,
)

MERENGA_EXCERPT_FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "merenga_camunda_cloud_excerpt.bpmn"
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

    def test_preserves_multi_value_same_name_and_exact_duplicates(self):
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
            [("equipment", "Весы"), ("equipment", "Миксер"), ("equipment", "Весы")],
        )
        self.assertEqual(len(set(prop["id"] for prop in props)), len(props))

    def test_property_id_stable_across_reparses(self):
        first = extract_camunda_extensions_from_bpmn_xml(self.ZEEBE_CAMUNDA_DUP_XML)
        second = extract_camunda_extensions_from_bpmn_xml(self.ZEEBE_CAMUNDA_DUP_XML)
        ids_first = [prop["id"] for prop in first["Task_1"]["properties"]["extensionProperties"]]
        ids_second = [prop["id"] for prop in second["Task_1"]["properties"]["extensionProperties"]]
        self.assertEqual(ids_first, ids_second)
        self.assertEqual(len(set(ids_first)), len(ids_first))

    LISTENER_XML = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
        'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">\n'
        '  <bpmn:process id="Process_1" isExecutable="false">\n'
        '    <bpmn:task id="Task_1">\n'
        '      <bpmn:extensionElements>\n'
        '        <camunda:executionListener event="start" class="com.example.StartListener" />\n'
        '        <camunda:executionListener event="end" expression="${endExpr}" />\n'
        '      </bpmn:extensionElements>\n'
        '    </bpmn:task>\n'
        '  </bpmn:process>\n'
        '</bpmn:definitions>'
    )

    def test_listener_id_deterministic_across_reparses(self):
        # Random listener ids used to defeat change detection: every reimport
        # looked "changed" and triggered spurious saves. Parsing identical XML
        # twice must now yield byte-identical extension maps.
        first = extract_camunda_extensions_from_bpmn_xml(self.LISTENER_XML)
        second = extract_camunda_extensions_from_bpmn_xml(self.LISTENER_XML)
        self.assertEqual(first, second)
        listeners = first["Task_1"]["properties"]["extensionListeners"]
        self.assertEqual(len(listeners), 2)
        ids = [row["id"] for row in listeners]
        self.assertEqual(len(set(ids)), len(ids))
        for row in listeners:
            self.assertTrue(row["id"].startswith("listener_"))

    def test_listener_id_changes_with_content(self):
        changed = self.LISTENER_XML.replace("com.example.StartListener", "com.example.OtherListener")
        first = extract_camunda_extensions_from_bpmn_xml(self.LISTENER_XML)
        other = extract_camunda_extensions_from_bpmn_xml(changed)
        self.assertNotEqual(
            first["Task_1"]["properties"]["extensionListeners"][0]["id"],
            other["Task_1"]["properties"]["extensionListeners"][0]["id"],
        )

class TestNamespacePriorityZeebeOverCamunda(unittest.TestCase):
    """Camunda Cloud exports carry parallel zeebe:/camunda: properties blocks
    that may diverge (the modeler writes only zeebe:). The live zeebe: block
    must win; legacy camunda: is a fallback for C7-only files."""

    @staticmethod
    def _xml(platform_attr="", task_extra=""):
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
            'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" '
            'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" '
            'xmlns:ns1="http://camunda.org/schema/modeler/1.0" '
            f'id="Definitions_1" {platform_attr}>\n'
            '  <bpmn:process id="Process_1" isExecutable="false">\n'
            '    <bpmn:task id="Activity_1ba1v7n">\n'
            '      <bpmn:extensionElements>\n'
            '        <zeebe:properties>\n'
            '          <zeebe:property name="container_tara" value="Противень" />\n'
            '          <zeebe:property name="ingredient" value="Готовый полуфабрикат блины" />\n'
            '        </zeebe:properties>\n'
            '        <camunda:properties>\n'
            '          <camunda:property name="container_tara" value="Противень" />\n'
            '          <camunda:property name="ingredient" value="Готовый полуфабрикат блины" />\n'
            '          <camunda:property name="tara" value="Шпилька" />\n'
            '        </camunda:properties>\n'
            '      </bpmn:extensionElements>\n'
            '    </bpmn:task>\n'
            f'{task_extra}\n'
            '  </bpmn:process>\n'
            '</bpmn:definitions>'
        )

    CAMUNDA_ONLY_TASK = (
        '    <bpmn:task id="Task_c7_only">\n'
        '      <bpmn:extensionElements>\n'
        '        <camunda:properties>\n'
        '          <camunda:property name="document" value="Задание на производство" />\n'
        '        </camunda:properties>\n'
        '      </bpmn:extensionElements>\n'
        '    </bpmn:task>'
    )

    @staticmethod
    def _props(result, element_id):
        entry = result.get(element_id) or {}
        return [
            (prop["name"], prop["value"])
            for prop in (entry.get("properties") or {}).get("extensionProperties") or []
        ]

    def test_divergent_blocks_no_marker_zeebe_wins(self):
        result = extract_camunda_extensions_from_bpmn_xml(self._xml())
        self.assertEqual(
            self._props(result, "Activity_1ba1v7n"),
            [("container_tara", "Противень"), ("ingredient", "Готовый полуфабрикат блины")],
        )
        # Stale legacy block is preserved raw, not exposed as managed props.
        preserved = " ".join(result["Activity_1ba1v7n"]["preservedExtensionElements"])
        self.assertIn("tara", preserved)
        self.assertIn("Шпилька", preserved)

    def test_divergent_blocks_cloud_marker_zeebe_wins(self):
        result = extract_camunda_extensions_from_bpmn_xml(
            self._xml('ns1:executionPlatform="Camunda Cloud"'),
        )
        self.assertEqual(
            self._props(result, "Activity_1ba1v7n"),
            [("container_tara", "Противень"), ("ingredient", "Готовый полуфабрикат блины")],
        )

    def test_divergent_blocks_platform_marker_camunda_wins(self):
        result = extract_camunda_extensions_from_bpmn_xml(
            self._xml('ns1:executionPlatform="Camunda Platform"'),
        )
        self.assertEqual(
            self._props(result, "Activity_1ba1v7n"),
            [
                ("container_tara", "Противень"),
                ("ingredient", "Готовый полуфабрикат блины"),
                ("tara", "Шпилька"),
            ],
        )

    def test_camunda_only_block_still_read_as_fallback(self):
        result = extract_camunda_extensions_from_bpmn_xml(self._xml(task_extra=self.CAMUNDA_ONLY_TASK))
        self.assertEqual(
            self._props(result, "Task_c7_only"),
            [("document", "Задание на производство")],
        )

    def test_zeebe_only_block_unchanged(self):
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
            'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_1">\n'
            '  <bpmn:process id="Process_1" isExecutable="false">\n'
            '    <bpmn:task id="Task_z8">\n'
            '      <bpmn:extensionElements>\n'
            '        <zeebe:properties>\n'
            '          <zeebe:property name="equipment" value="Лопатка" />\n'
            '        </zeebe:properties>\n'
            '      </bpmn:extensionElements>\n'
            '    </bpmn:task>\n'
            '  </bpmn:process>\n'
            '</bpmn:definitions>'
        )
        result = extract_camunda_extensions_from_bpmn_xml(xml)
        self.assertEqual(self._props(result, "Task_z8"), [("equipment", "Лопатка")])

    def test_no_extension_elements_regression(self):
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">\n'
            '  <bpmn:process id="Process_1" isExecutable="false">\n'
            '    <bpmn:task id="Task_plain" />\n'
            '  </bpmn:process>\n'
            '</bpmn:definitions>'
        )
        self.assertEqual(extract_camunda_extensions_from_bpmn_xml(xml), {})

    def test_detect_camunda_namespace_divergence(self):
        result = detect_camunda_namespace_divergence(self._xml())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["element_id"], "Activity_1ba1v7n")
        self.assertEqual(result[0]["camunda_only"], [{"name": "tara", "value": "Шпилька"}])
        self.assertEqual(result[0]["zeebe_only"], [])
        # Identical blocks do not diverge.
        self.assertEqual(detect_camunda_namespace_divergence(TestExtractDedupAndStableId.ZEEBE_CAMUNDA_DUP_XML), [])


class TestRealMerengaExcerptFixture(unittest.TestCase):
    """Verbatim excerpt of the real «Меренга_Торт_Крепвиль» Camunda Cloud 8.8
    export (backend/tests/fixtures/merenga_camunda_cloud_excerpt.bpmn):
    two divergent elements, one camunda-only event, one camunda-only
    multi-value task."""

    @classmethod
    def setUpClass(cls):
        cls.xml = MERENGA_EXCERPT_FIXTURE.read_text(encoding="utf-8")
        cls.result = extract_camunda_extensions_from_bpmn_xml(cls.xml)

    @staticmethod
    def _props(result, element_id):
        entry = result.get(element_id) or {}
        return [
            (prop["name"], prop["value"])
            for prop in (entry.get("properties") or {}).get("extensionProperties") or []
        ]

    def test_divergent_task_has_exactly_the_zeebe_set(self):
        # The user-visible regression: stale tara=Шпилька from the legacy
        # camunda: block must not leak into this element.
        self.assertEqual(
            self._props(self.result, "Activity_1ba1v7n"),
            [("container_tara", "Противень"), ("ingredient", "Готовый полуфабрикат блины")],
        )
        self.assertEqual(
            self._props(self.result, "Activity_18xixja"),
            [("container_tara", "Дежа"), ("ingredient", "Тесто")],
        )

    def test_camunda_only_event_falls_back_to_legacy_block(self):
        self.assertEqual(
            self._props(self.result, "Event_18h1aoo"),
            [("document", "Задание на производство")],
        )

    def test_camunda_only_multi_value_task_keeps_all_rows(self):
        self.assertEqual(
            self._props(self.result, "Activity_0wh7wzm"),
            [
                ("ingredient", "Готовый полуфабрикат блины"),
                ("ingredient", "Крем"),
                ("equipment", "Весы высокоточные"),
            ],
        )

    def test_fixture_divergence_report(self):
        div = detect_camunda_namespace_divergence(self.xml)
        self.assertEqual([d["element_id"] for d in div], ["Activity_1ba1v7n", "Activity_18xixja"])


if __name__ == "__main__":
    unittest.main()
