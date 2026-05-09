import json
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.rag.chunker import chunk_bpmn_xml, chunk_product_actions, chunk_text


SAMPLE_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="proc1" isExecutable="false">
    <bpmn:startEvent id="start1" name="Start"/>
    <bpmn:userTask id="task1" name="Prepare ingredients">
      <bpmn:incoming>flow0</bpmn:incoming>
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:serviceTask id="task2" name="Cook meal">
      <bpmn:incoming>flow1</bpmn:incoming>
      <bpmn:outgoing>flow2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="end1" name="End"/>
    <bpmn:sequenceFlow id="flow1" sourceRef="task1" targetRef="task2"/>
    <bpmn:sequenceFlow id="flow2" sourceRef="task2" targetRef="end1"/>
  </bpmn:process>
</definitions>"""

SAMPLE_ACTIONS = [
    {
        "step_id": "step_001",
        "action_type": "нарезка",
        "product_name": "куриная грудка",
        "product_group": "мясо",
        "stage": "подготовка",
        "step": "предварительная обработка",
        "method": "нож",
        "role": "повар",
    },
    {
        "step_id": "step_002",
        "action_type": "перетаривание",
        "product_name": "рис",
        "product_group": "крупы",
        "stage": "до разогрева",
        "step": "переворот контейнера",
        "method": "вручную",
        "role": "оператор",
    },
]


class ChunkBpmnXmlTests(unittest.TestCase):
    def test_returns_chunks(self):
        chunks = chunk_bpmn_xml(SAMPLE_BPMN)
        self.assertGreater(len(chunks), 0)

    def test_no_empty_chunks(self):
        chunks = chunk_bpmn_xml(SAMPLE_BPMN)
        for c in chunks:
            self.assertTrue(c["chunk_text"].strip(), "Found empty chunk_text")

    def test_chunk_index_sequential(self):
        chunks = chunk_bpmn_xml(SAMPLE_BPMN)
        for i, c in enumerate(chunks):
            self.assertEqual(c["chunk_index"], i)

    def test_token_count_positive(self):
        chunks = chunk_bpmn_xml(SAMPLE_BPMN)
        for c in chunks:
            self.assertGreater(c["token_count"], 0)

    def test_metadata_json_parseable(self):
        chunks = chunk_bpmn_xml(SAMPLE_BPMN, metadata={"source_id": "sess_abc"})
        for c in chunks:
            meta = json.loads(c["metadata_json"])
            self.assertIsInstance(meta, dict)
            self.assertEqual(meta.get("source_id"), "sess_abc")

    def test_element_tag_in_metadata(self):
        chunks = chunk_bpmn_xml(SAMPLE_BPMN)
        tags = {json.loads(c["metadata_json"]).get("element_tag") for c in chunks}
        self.assertTrue(tags - {None}, "Expected at least one element_tag in metadata")

    def test_fallback_on_plain_text(self):
        chunks = chunk_bpmn_xml("Hello world, no XML elements here.")
        self.assertGreater(len(chunks), 0)
        for c in chunks:
            meta = json.loads(c["metadata_json"])
            self.assertTrue(meta.get("fallback"))


class ChunkProductActionsTests(unittest.TestCase):
    def test_returns_one_chunk_per_action(self):
        chunks = chunk_product_actions(SAMPLE_ACTIONS)
        self.assertEqual(len(chunks), len(SAMPLE_ACTIONS))

    def test_no_empty_chunks(self):
        chunks = chunk_product_actions(SAMPLE_ACTIONS)
        for c in chunks:
            self.assertTrue(c["chunk_text"].strip())

    def test_token_count_positive(self):
        chunks = chunk_product_actions(SAMPLE_ACTIONS)
        for c in chunks:
            self.assertGreater(c["token_count"], 0)

    def test_metadata_preserves_step_id(self):
        chunks = chunk_product_actions(SAMPLE_ACTIONS)
        meta0 = json.loads(chunks[0]["metadata_json"])
        self.assertEqual(meta0["step_id"], "step_001")
        meta1 = json.loads(chunks[1]["metadata_json"])
        self.assertEqual(meta1["step_id"], "step_002")

    def test_metadata_preserves_action_type(self):
        chunks = chunk_product_actions(SAMPLE_ACTIONS)
        meta0 = json.loads(chunks[0]["metadata_json"])
        self.assertEqual(meta0["action_type"], "нарезка")

    def test_chunk_text_contains_fields(self):
        chunks = chunk_product_actions(SAMPLE_ACTIONS)
        self.assertIn("нарезка", chunks[0]["chunk_text"])
        self.assertIn("куриная грудка", chunks[0]["chunk_text"])

    def test_empty_list_returns_no_chunks(self):
        chunks = chunk_product_actions([])
        self.assertEqual(chunks, [])


class ChunkTextTests(unittest.TestCase):
    def test_single_paragraph(self):
        chunks = chunk_text("Hello world.")
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0]["chunk_text"], "Hello world.")

    def test_multiple_paragraphs(self):
        text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        chunks = chunk_text(text)
        self.assertEqual(len(chunks), 3)

    def test_long_paragraph_splits(self):
        long_para = "word " * 600
        chunks = chunk_text(long_para)
        self.assertGreater(len(chunks), 1)

    def test_no_empty_chunks(self):
        text = "Para one.\n\n\n\nPara two.\n\nPara three."
        chunks = chunk_text(text)
        for c in chunks:
            self.assertTrue(c["chunk_text"].strip())

    def test_chunk_index_sequential(self):
        text = "A.\n\nB.\n\nC."
        chunks = chunk_text(text)
        for i, c in enumerate(chunks):
            self.assertEqual(c["chunk_index"], i)

    def test_metadata_passed_through(self):
        chunks = chunk_text("Some text.", metadata={"key": "val"})
        meta = json.loads(chunks[0]["metadata_json"])
        self.assertEqual(meta["key"], "val")

    def test_empty_string_returns_no_chunks(self):
        chunks = chunk_text("")
        self.assertEqual(chunks, [])


if __name__ == "__main__":
    unittest.main()
