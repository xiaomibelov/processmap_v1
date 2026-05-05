import unittest


ANALYSIS_FIXTURE = {
    "product_actions": [
        {
            "id": "pa_test",
            "bpmn_element_id": "Activity_Test",
            "action_type": "нарезка",
            "action_stage": "подготовка",
            "action_object": "куриная грудка",
            "action_method": "нож",
            "source": "manual",
            "confidence": 1,
            "manual_corrected": True,
        }
    ],
    "custom_marker": "preserve-me",
}


class FakeStorage:
    def __init__(self, session):
        self.session = session

    def load(self, session_id, org_id=None, is_admin=None):
        if str(session_id) != str(getattr(self.session, "id", "")):
            return None
        return self.session


class InterviewAnalysisNamespaceGuardTest(unittest.TestCase):
    def test_patch_merge_preserves_analysis_when_incoming_omits_it(self):
        from app._legacy_main import _merge_interview_with_server_fields

        out = _merge_interview_with_server_fields(
            {
                "analysis": ANALYSIS_FIXTURE,
                "report_versions": {"p1": [{"id": "r1"}]},
                "path_reports": {"p1": {"id": "r1"}},
            },
            {"steps": [{"id": "s1", "title": "Only user payload"}]},
        )

        self.assertEqual(out["analysis"], ANALYSIS_FIXTURE)
        self.assertEqual(out["report_versions"], {"p1": [{"id": "r1"}]})
        self.assertEqual(out["path_reports"], {"p1": {"id": "r1"}})

    def test_patch_merge_merges_incoming_analysis_without_losing_sibling_keys(self):
        from app._legacy_main import _merge_interview_with_server_fields

        out = _merge_interview_with_server_fields(
            {"analysis": ANALYSIS_FIXTURE},
            {"analysis": {"custom_marker": "updated", "new_marker": "incoming"}},
        )

        self.assertEqual(out["analysis"]["custom_marker"], "updated")
        self.assertEqual(out["analysis"]["new_marker"], "incoming")
        self.assertEqual(out["analysis"]["product_actions"], ANALYSIS_FIXTURE["product_actions"])

    def test_patch_merge_ignores_malformed_incoming_analysis(self):
        from app._legacy_main import _merge_interview_with_server_fields

        out = _merge_interview_with_server_fields(
            {"analysis": ANALYSIS_FIXTURE},
            {"analysis": "not-an-object", "steps": []},
        )

        self.assertEqual(out["analysis"], ANALYSIS_FIXTURE)

    def test_report_helpers_preserve_analysis_namespace(self):
        from app._legacy_main import _set_latest_path_report_pointer, _set_report_versions_by_path
        from app.models import Session

        session = Session(id="s1", title="Report", interview={"analysis": ANALYSIS_FIXTURE})
        row = {
            "id": "r1",
            "session_id": "s1",
            "path_id": "p1",
            "version": 1,
            "steps_hash": "hash",
            "created_at": 1,
            "status": "running",
        }

        _set_report_versions_by_path(session, {"p1": [row]})
        _set_latest_path_report_pointer(session, "p1", row)

        self.assertEqual(session.interview["analysis"], ANALYSIS_FIXTURE)
        self.assertEqual(session.interview["report_versions"]["p1"][0]["id"], "r1")
        self.assertEqual(session.interview["path_reports"]["p1"]["id"], "r1")

    def test_ai_question_sync_preserves_analysis_namespace(self):
        from app._legacy_main import _sync_interview_ai_questions_for_node
        from app.models import Question, Session

        session = Session(
            id="s1",
            title="AI",
            interview={
                "analysis": ANALYSIS_FIXTURE,
                "steps": [{"id": "step_1", "node_id": "Activity_Test"}],
            },
            questions=[
                Question(
                    id="llm_1",
                    node_id="Activity_Test",
                    issue_type="MISSING",
                    question="Что нарезают?",
                    status="open",
                )
            ],
        )

        _sync_interview_ai_questions_for_node(session, "Activity_Test", preferred_step_id="step_1")

        self.assertEqual(session.interview["analysis"], ANALYSIS_FIXTURE)
        self.assertEqual(session.interview["ai_questions"]["step_1"][0]["text"], "Что нарезают?")

    def test_save_guard_refreshes_current_analysis_before_report_or_ai_save(self):
        from app._legacy_main import _preserve_current_interview_analysis_before_save
        from app.models import Session

        current = Session(id="s1", title="Current", interview={"analysis": ANALYSIS_FIXTURE})
        outgoing = Session(id="s1", title="Outgoing", interview={"steps": [{"id": "s1"}]})

        _preserve_current_interview_analysis_before_save(FakeStorage(current), outgoing)

        self.assertEqual(outgoing.interview["analysis"], ANALYSIS_FIXTURE)

    def test_save_guard_prefers_current_analysis_over_stale_writer_copy(self):
        from app._legacy_main import _preserve_current_interview_analysis_before_save
        from app.models import Session

        current = Session(
            id="s1",
            title="Current",
            interview={"analysis": {**ANALYSIS_FIXTURE, "custom_marker": "current"}},
        )
        outgoing = Session(
            id="s1",
            title="Outgoing",
            interview={"analysis": {**ANALYSIS_FIXTURE, "custom_marker": "stale"}},
        )

        _preserve_current_interview_analysis_before_save(FakeStorage(current), outgoing)

        self.assertEqual(outgoing.interview["analysis"]["custom_marker"], "current")


if __name__ == "__main__":
    unittest.main()
