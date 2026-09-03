"""Экспорт сессии: bpmn_meta.camunda_extensions_by_element_id -> zeebe:properties (Camunda 8)."""
import unittest
import xml.etree.ElementTree as ET

from app.exporters.bpmn import export_session_to_bpmn_xml

ZEEBE_NS = "http://camunda.org/schema/zeebe/1.0"
MODELER_NS = "http://camunda.org/schema/modeler/1.0"


def _session_with_meta():
    return {
        "id": "s1",
        "title": "Тест",
        "roles": ["Повар 1"],
        "start_role": "Повар 1",
        "nodes": [
            {"id": "Task_1", "type": "step", "title": "Взвешивание", "actor_role": "Повар 1"},
        ],
        "edges": [],
        "bpmn_meta": {
            "camunda_extensions_by_element_id": {
                "Task_1": {
                    "properties": {
                        "extensionProperties": [
                            {"id": "prop_1", "name": "container", "value": "Лоток 150x55"},
                            {"id": "prop_2", "name": "equipment", "value": "Весы высокоточные"},
                        ],
                        "extensionListeners": [],
                    },
                    "preservedExtensionElements": [],
                },
            },
        },
    }


class BpmnExportCamunda8PropertiesTest(unittest.TestCase):
    def test_export_writes_zeebe_properties_and_no_camunda_property(self):
        xml_text = export_session_to_bpmn_xml(_session_with_meta())
        root = ET.fromstring(xml_text)

        task = next(el for el in root.iter() if el.tag == "{http://www.omg.org/spec/BPMN/20100524/MODEL}task")
        ext = next((el for el in task if el.tag.endswith("}extensionElements")), None)
        self.assertIsNotNone(ext, "У task должен появиться extensionElements")

        zeebe_props = [el for el in ext.iter() if el.tag == f"{{{ZEEBE_NS}}}properties"]
        self.assertEqual(len(zeebe_props), 1, "Ожидается ровно один zeebe:properties блок")
        rows = {
            el.attrib.get("name"): el.attrib.get("value")
            for el in zeebe_props[0].iter()
            if el.tag == f"{{{ZEEBE_NS}}}property"
        }
        self.assertEqual(rows, {"container": "Лоток 150x55", "equipment": "Весы высокоточные"})

        camunda_rows = [
            el for el in root.iter()
            if el.tag == "{http://camunda.org/schema/1.0/bpmn}property"
        ]
        self.assertEqual(camunda_rows, [], "camunda:property в выводе быть не должно")

        platform = root.attrib.get(f"{{{MODELER_NS}}}executionPlatform")
        self.assertEqual(platform, "Camunda Cloud")

    def test_export_without_meta_has_no_extension_elements_and_no_platform(self):
        session = _session_with_meta()
        session.pop("bpmn_meta")
        xml_text = export_session_to_bpmn_xml(session)
        root = ET.fromstring(xml_text)

        ext_elements = [el for el in root.iter() if el.tag.endswith("}extensionElements")]
        self.assertEqual(ext_elements, [])
        platform_attrs = [
            (name, value) for name, value in root.attrib.items()
            if name.split("}")[-1] == "executionPlatform"
        ]
        self.assertEqual(platform_attrs, [])


if __name__ == "__main__":
    unittest.main()
