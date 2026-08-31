import json
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.rag.chunker import (
    chunk_bpmn_xml,
    chunk_glossary,
    chunk_operation_catalog,
    chunk_product_actions,
    chunk_property_dictionary,
    chunk_text,
)


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

SAMPLE_PROPERTY_ROWS = [
    {
        "id": "priority",
        "display_name": "Приоритет",
        "property_type": "enum",
        "applicable_to": ["Task"],
        "value_range": {"options": ["low", "medium", "high"]},
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["properties_panel", "export"],
        "category": "general",
        "inheritance": "none",
    },
]

SAMPLE_ORG_PROPERTY_ROWS = [
    {
        "operation_key": "cook",
        "property_key": "temp_c",
        "property_label": "Температура",
        "input_mode": "number",
        "allow_custom_value": True,
        "required": True,
        "options": ["180", "200"],
    },
]

SAMPLE_OPERATIONS = [
    {
        "code": "open_container",
        "name": "Open Container",
        "name_ru": "Вскрыть контейнер",
        "category": "container",
        "parameter_schema": {"container_id": {"type": "string", "required": True}},
        "allowed_outputs": [{"name": "container_opened", "type": "success"}],
        "execution_contract": {"preconditions": ["container_closed"]},
        "resource_requirements": {"equipment": ["container_opener"], "time_estimate_sec": 15},
    },
]

SAMPLE_GLOSSARY = {
    "version": 1,
    "equipment": [
        {"canon": "blast_chiller_1", "title": "Камера интенсивного охлаждения", "aliases": ["шокер"]},
    ],
    "resources": [{"canon": "water", "title": "Вода", "aliases": ["вода"]}],
    "units": [{"canon": "kg", "title": "килограмм", "aliases": ["кг"]}],
}


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


class ChunkPropertyDictionaryTests(unittest.TestCase):
    def test_returns_one_chunk_per_system_property(self):
        chunks = chunk_property_dictionary(SAMPLE_PROPERTY_ROWS)
        self.assertEqual(len(chunks), len(SAMPLE_PROPERTY_ROWS))

    def test_chunk_text_contains_display_name_and_type(self):
        chunks = chunk_property_dictionary(SAMPLE_PROPERTY_ROWS)
        self.assertIn("Приоритет", chunks[0]["chunk_text"])
        self.assertIn("enum", chunks[0]["chunk_text"])

    def test_metadata_preserves_property_key(self):
        chunks = chunk_property_dictionary(SAMPLE_PROPERTY_ROWS)
        meta = json.loads(chunks[0]["metadata_json"])
        self.assertEqual(meta["property_key"], "priority")
        self.assertEqual(meta["source_type"], "property_dictionary")

    def test_org_property_includes_options(self):
        chunks = chunk_property_dictionary(SAMPLE_ORG_PROPERTY_ROWS)
        self.assertEqual(len(chunks), 1)
        self.assertIn("Температура", chunks[0]["chunk_text"])
        self.assertIn("180", chunks[0]["chunk_text"])


class ChunkOperationCatalogTests(unittest.TestCase):
    def test_returns_one_chunk_per_operation(self):
        chunks = chunk_operation_catalog(SAMPLE_OPERATIONS)
        self.assertEqual(len(chunks), len(SAMPLE_OPERATIONS))

    def test_chunk_text_contains_code_and_parameters(self):
        chunks = chunk_operation_catalog(SAMPLE_OPERATIONS)
        self.assertIn("open_container", chunks[0]["chunk_text"])
        self.assertIn("container_id", chunks[0]["chunk_text"])

    def test_metadata_preserves_operation_code(self):
        chunks = chunk_operation_catalog(SAMPLE_OPERATIONS)
        meta = json.loads(chunks[0]["metadata_json"])
        self.assertEqual(meta["operation_code"], "open_container")
        self.assertEqual(meta["source_type"], "operation_catalog")


class ChunkGlossaryTests(unittest.TestCase):
    def test_returns_one_chunk_per_term(self):
        chunks = chunk_glossary(SAMPLE_GLOSSARY)
        self.assertEqual(len(chunks), 3)

    def test_chunk_text_contains_title_and_aliases(self):
        chunks = chunk_glossary(SAMPLE_GLOSSARY)
        texts = " ".join(c["chunk_text"] for c in chunks)
        self.assertIn("шокер", texts)
        self.assertIn("Камера интенсивного охлаждения", texts)

    def test_metadata_preserves_term_canon(self):
        chunks = chunk_glossary(SAMPLE_GLOSSARY)
        canons = {json.loads(c["metadata_json"]).get("term_canon") for c in chunks}
        self.assertIn("blast_chiller_1", canons)


if __name__ == "__main__":
    unittest.main()
