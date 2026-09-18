"""Guard tests for camunda meta rebuild on broken/suspicious XML.

Runs WITHOUT the redis broker: exercises _meta_with_fresh_camunda_extensions
and the prune migration script directly. Kept out of test_bpmn_meta.py on
purpose — that file is entirely skip_if_hanging outside docker compose.
"""
import logging
import os
import tempfile
import unittest

LEGACY_LOGGER = "app._legacy_main"
MIGRATION_LOGGER = "scripts.prune_orphan_camunda_meta"

BROKEN_XML = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1"><bpmn:process id="P1"><bpmn:task id="Task_1">'

VALID_NO_PROPS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>
"""

EMPTY_DIAGRAM_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_empty" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_empty" isExecutable="false" />
</bpmn:definitions>
"""

OLD_SECTION = {
    "Task_1": {
        "properties": {
            "extensionProperties": [{"id": "prop_a", "name": "ee_time", "value": "0.33"}],
            "extensionListeners": [],
        },
        "preservedExtensionElements": [],
    }
}


class CamundaMetaGuardHelperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")
        from app._legacy_main import _meta_with_fresh_camunda_extensions

        self.helper = _meta_with_fresh_camunda_extensions

    def tearDown(self):
        self.tmp.cleanup()

    def _meta(self):
        return {"camunda_extensions_by_element_id": dict(OLD_SECTION), "custom_key": "keep-me"}

    def test_broken_xml_keeps_camunda_section_and_logs_warning(self):
        meta = self._meta()
        with self.assertLogs(LEGACY_LOGGER, level="WARNING") as captured:
            out = self.helper(meta, BROKEN_XML, session_id="sess-broken")
        section = (out or {}).get("camunda_extensions_by_element_id") or {}
        self.assertEqual(section, OLD_SECTION, "broken XML must not wipe the camunda section")
        self.assertEqual(out.get("custom_key"), "keep-me")
        self.assertTrue(
            any("sess-broken" in message for message in captured.output),
            f"warning must mention session_id, got {captured.output}",
        )

    def test_valid_xml_without_props_replaces_section_and_logs_info(self):
        meta = self._meta()
        with self.assertLogs(LEGACY_LOGGER, level="INFO") as captured:
            out = self.helper(meta, VALID_NO_PROPS_XML, session_id="sess-clean")
        self.assertEqual((out or {}).get("camunda_extensions_by_element_id"), {}, "legit removal must clear the section")
        self.assertTrue(
            any("sess-clean" in message for message in captured.output),
            f"info must mention session_id, got {captured.output}",
        )

    def test_empty_diagram_replaces_section_and_logs_info(self):
        meta = self._meta()
        with self.assertLogs(LEGACY_LOGGER, level="INFO") as captured:
            out = self.helper(meta, EMPTY_DIAGRAM_XML, session_id="sess-empty")
        self.assertEqual((out or {}).get("camunda_extensions_by_element_id"), {}, "empty diagram must clear the section")
        self.assertTrue(any("sess-empty" in m for m in captured.output), f"got {captured.output}")

    def test_valid_xml_with_props_replaces_section(self):
        xml = VALID_NO_PROPS_XML.replace(
            '<bpmn:task id="Task_1">',
            '<bpmn:task id="Task_1"><bpmn:extensionElements>'
            '<camunda:properties xmlns:camunda="http://camunda.org/schema/1.0/bpmn">'
            '<camunda:property name="ee_temp" value="4" /></camunda:properties>'
            '</bpmn:extensionElements>',
        )
        out = self.helper(self._meta(), xml, session_id="sess-props")
        section = (out or {}).get("camunda_extensions_by_element_id") or {}
        self.assertIn("Task_1", section)
        self.assertEqual(section["Task_1"]["properties"]["extensionProperties"][0]["name"], "ee_temp")


class CamundaMetaGuardMigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROCESS_DB_PATH"] = os.path.join(self.tmp.name, "processmap.sqlite3")
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.db.config import get_db_runtime_config

        get_db_runtime_config.cache_clear()
        try:
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass

        from app.storage import get_storage

        self.get_storage = get_storage

    def tearDown(self):
        self.tmp.cleanup()

    def _seed(self, *, xml: str, meta: dict) -> str:
        st = self.get_storage()
        sid = st.create("guard-migration", user_id="guard-user", is_admin=True)
        sess = st.load(sid, is_admin=True)
        sess.bpmn_xml = xml
        sess.bpmn_meta = dict(meta or {})
        st.save(sess, is_admin=True)
        return sid

    def test_migration_skips_broken_xml_session_and_warns(self):
        from scripts.prune_orphan_camunda_meta import prune_orphan_camunda_meta

        sid = self._seed(xml=BROKEN_XML, meta={"camunda_extensions_by_element_id": dict(OLD_SECTION)})
        with self.assertLogs(MIGRATION_LOGGER, level="WARNING"):
            summary = prune_orphan_camunda_meta(apply_changes=True)
        self.assertEqual(int(summary.get("parse_errors") or 0), 1)
        skipped = [s for s in summary["sessions"] if s.get("parse_error")]
        self.assertEqual(len(skipped), 1, f"report must list the skipped session, got {summary['sessions']}")
        reloaded = self.get_storage().load(sid, is_admin=True)
        section = (reloaded.bpmn_meta or {}).get("camunda_extensions_by_element_id") or {}
        self.assertEqual(section, OLD_SECTION, "apply must not touch a session with broken XML")

    def test_migration_applies_legit_removal_with_flow_elements(self):
        from scripts.prune_orphan_camunda_meta import prune_orphan_camunda_meta

        sid = self._seed(xml=VALID_NO_PROPS_XML, meta={"camunda_extensions_by_element_id": dict(OLD_SECTION)})
        summary = prune_orphan_camunda_meta(apply_changes=True)
        self.assertEqual(int(summary.get("sessions_applied") or 0), 1)
        reloaded = self.get_storage().load(sid, is_admin=True)
        self.assertEqual((reloaded.bpmn_meta or {}).get("camunda_extensions_by_element_id"), {})


if __name__ == "__main__":
    unittest.main()
