import os
import shutil
import tempfile
import unittest

from app.services.bpmn_navigation import find_subprocess_elements


class TestFindSubprocessElements(unittest.TestCase):
    def test_returns_top_level_subprocess_only(self):
        xml = '''<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="ns">
          <process id="p">
            <subProcess id="sub_1" name="Prepare" />
            <subProcess id="sub_2" />
            <subProcess id="sub_nested" name="Nested">
              <subProcess id="sub_inner" name="Inner" />
            </subProcess>
          </process>
        </definitions>'''
        result = find_subprocess_elements(xml)
        ids = {e["id"] for e in result}
        self.assertEqual(ids, {"sub_1", "sub_2", "sub_nested"})
        by_id = {e["id"]: e for e in result}
        self.assertEqual(by_id["sub_1"]["name"], "Prepare")
        self.assertIsNone(by_id["sub_2"]["name"])
        self.assertEqual(by_id["sub_nested"]["name"], "Nested")

    def test_returns_empty_for_empty_xml(self):
        self.assertEqual(find_subprocess_elements(""), [])

    def test_returns_empty_for_invalid_xml(self):
        self.assertEqual(find_subprocess_elements("not xml"), [])
