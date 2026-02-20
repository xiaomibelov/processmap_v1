import unittest
import xml.etree.ElementTree as ET

from app.exporters.bpmn import export_session_to_bpmn_xml
from app.models import Node, Session


def _local(tag: str) -> str:
    return tag.split("}", 1)[-1].lower()


def _iter_local(root, local_name: str):
    name = local_name.lower()
    for el in root.iter():
        if _local(el.tag) == name:
            yield el


class BpmnTextAnnotationExportTest(unittest.TestCase):
    def test_exports_text_annotation_and_association_for_interview_comment(self):
        session = Session(
            id="s1",
            title="Тест",
            roles=["Повар 1", "Повар 2"],
            start_role="Повар 1",
            interview={
                "steps": [
                    {
                        "id": "step_1",
                        "node_id": "Activity_1",
                        "action": "Первая",
                        "comment": "Text annotation отправлен",
                    },
                ],
            },
            nodes=[
                Node(id="Activity_1", type="step", title="Первая", actor_role="Повар 1"),
            ],
            edges=[],
        )

        xml_text = export_session_to_bpmn_xml(session)
        root = ET.fromstring(xml_text)

        annotations = list(_iter_local(root, "textAnnotation"))
        self.assertGreaterEqual(len(annotations), 1, "В BPMN не найден textAnnotation")

        annotation_id = ""
        for ann in annotations:
            text_nodes = list(_iter_local(ann, "text"))
            text = (text_nodes[0].text or "").strip() if text_nodes else ""
            if text == "Text annotation отправлен":
                annotation_id = ann.attrib.get("id", "").strip()
                break

        self.assertTrue(annotation_id, "В BPMN нет textAnnotation с ожидаемым текстом")

        associations = list(_iter_local(root, "association"))
        linked = any(
            a.attrib.get("sourceRef") == "Activity_1" and a.attrib.get("targetRef") == annotation_id
            for a in associations
        )
        self.assertTrue(linked, "Нет association между узлом Activity_1 и textAnnotation")


if __name__ == "__main__":
    unittest.main()
