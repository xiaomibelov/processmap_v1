import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.rag.chunker import chunk_bpmn_xml


class BpmnChunkerMetadataTests(unittest.TestCase):

    def _first_meta(self, xml, **kw):
        chunks = chunk_bpmn_xml(xml, **kw)
        self.assertTrue(chunks, "expected at least one chunk")
        import json
        return json.loads(chunks[0]["metadata_json"])

    # 1. exclusiveGateway with id and name
    def test_exclusive_gateway_extracts_id_name_type(self):
        xml = '<definitions><bpmn:exclusiveGateway id="gw1" name="Вид топпинга"/></definitions>'
        meta = self._first_meta(xml)
        self.assertEqual(meta["element_id"], "gw1")
        self.assertEqual(meta["element_name"], "Вид топпинга")
        self.assertEqual(meta["element_type"], "exclusiveGateway")
        self.assertEqual(meta["element_tag"], "exclusiveGateway")

    # 2. userTask with id and name
    def test_user_task_extracts_id_name_type(self):
        xml = '<definitions><bpmn:userTask id="t1" name="Нарезка грудки"/></definitions>'
        meta = self._first_meta(xml)
        self.assertEqual(meta["element_id"], "t1")
        self.assertEqual(meta["element_name"], "Нарезка грудки")
        self.assertEqual(meta["element_type"], "userTask")

    # 3. sequenceFlow with id, sourceRef, targetRef, name
    def test_sequence_flow_extracts_all_fields(self):
        xml = '<definitions><bpmn:sequenceFlow id="f1" name="Да" sourceRef="t1" targetRef="gw1"/></definitions>'
        meta = self._first_meta(xml)
        self.assertEqual(meta["element_id"], "f1")
        self.assertEqual(meta["element_name"], "Да")
        self.assertEqual(meta["element_type"], "sequenceFlow")
        self.assertEqual(meta["source_ref"], "t1")
        self.assertEqual(meta["target_ref"], "gw1")

    # 4. sequenceFlow without name → element_name is None
    def test_sequence_flow_without_name_gives_none(self):
        xml = '<definitions><bpmn:sequenceFlow id="f2" sourceRef="a" targetRef="b"/></definitions>'
        meta = self._first_meta(xml)
        self.assertIsNone(meta["element_name"])
        self.assertEqual(meta["source_ref"], "a")
        self.assertEqual(meta["target_ref"], "b")

    # 5. Element without name attribute → element_name is None (not empty string)
    def test_element_without_name_gives_none_not_empty(self):
        xml = '<definitions><bpmn:serviceTask id="st1"/></definitions>'
        meta = self._first_meta(xml)
        self.assertIsNone(meta["element_name"])
        self.assertEqual(meta["element_id"], "st1")

    # 6. Non-flow element has no source_ref / target_ref keys
    def test_non_flow_element_has_no_source_target_ref(self):
        xml = '<definitions><bpmn:userTask id="t2" name="Упаковка"/></definitions>'
        meta = self._first_meta(xml)
        self.assertNotIn("source_ref", meta)
        self.assertNotIn("target_ref", meta)

    # 7. Malformed / minimal XML — no BPMN matches → fallback chunks, no crash
    def test_malformed_xml_no_crash(self):
        chunks = chunk_bpmn_xml("<not-bpmn><foo/></not-bpmn>")
        self.assertIsInstance(chunks, list)

    def test_empty_xml_no_crash(self):
        chunks = chunk_bpmn_xml("")
        self.assertIsInstance(chunks, list)

    # 8. Preserves existing element_tag and element_index fields
    def test_preserves_element_tag_and_index(self):
        xml = '<definitions><bpmn:userTask id="t1" name="Шаг 1"/></definitions>'
        import json
        chunks = chunk_bpmn_xml(xml)
        self.assertGreaterEqual(len(chunks), 1)
        m0 = json.loads(chunks[0]["metadata_json"])
        self.assertEqual(m0["element_tag"], "userTask")
        self.assertIn("element_index", m0)
        self.assertIsInstance(m0["element_index"], int)

    # 9. Backward compat: old chunk metadata without element_name key → .get() returns None safely
    def test_old_chunk_without_element_name_is_safe(self):
        old_meta = {"element_tag": "task", "element_index": 0, "source_type": "bpmn_xml"}
        self.assertIsNone(old_meta.get("element_name"))
        self.assertIsNone(old_meta.get("element_id"))

    # 10. Base metadata is passed through to chunk
    def test_base_metadata_preserved(self):
        xml = '<definitions><bpmn:userTask id="t1" name="X"/></definitions>'
        base = {"session_id": "s1", "org_id": "o1"}
        meta = self._first_meta(xml, metadata=base)
        self.assertEqual(meta["session_id"], "s1")
        self.assertEqual(meta["org_id"], "o1")
        self.assertEqual(meta["element_name"], "X")


if __name__ == "__main__":
    unittest.main()
