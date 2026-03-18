import unittest

from fastapi import HTTPException

from app.session_status import normalize_session_status, validate_session_status_transition


class SessionStatusTransitionsTest(unittest.TestCase):
    def _assert_http_error(self, fn, *, status_code: int, detail: str):
        with self.assertRaises(HTTPException) as err:
            fn()
        self.assertEqual(int(err.exception.status_code or 0), int(status_code))
        self.assertEqual(str(err.exception.detail or ""), str(detail))

    def test_normalize_supports_done_and_archive_aliases(self):
        self.assertEqual(normalize_session_status("done"), "ready")
        self.assertEqual(normalize_session_status("archive"), "archived")
        self.assertEqual(normalize_session_status("inprogress"), "in_progress")

    def test_manual_forward_flow_remains_valid(self):
        self.assertEqual(
            validate_session_status_transition("draft", "in_progress", can_edit=True, can_archive=True),
            "in_progress",
        )
        self.assertEqual(
            validate_session_status_transition("in_progress", "review", can_edit=True, can_archive=True),
            "review",
        )
        self.assertEqual(
            validate_session_status_transition("review", "ready", can_edit=True, can_archive=True),
            "ready",
        )
        self.assertEqual(
            validate_session_status_transition("ready", "archived", can_edit=True, can_archive=True),
            "archived",
        )

    def test_archived_can_transition_back_to_all_manual_statuses(self):
        for next_status in ("draft", "in_progress", "review", "ready", "archived"):
            with self.subTest(next_status=next_status):
                self.assertEqual(
                    validate_session_status_transition("archived", next_status, can_edit=True, can_archive=True),
                    next_status,
                )

    def test_business_conflict_409_kept_for_invalid_transition(self):
        self._assert_http_error(
            lambda: validate_session_status_transition("draft", "review", can_edit=True, can_archive=True),
            status_code=409,
            detail="invalid status transition",
        )

    def test_archiving_requires_manage_rights(self):
        self._assert_http_error(
            lambda: validate_session_status_transition("review", "archived", can_edit=True, can_archive=False),
            status_code=403,
            detail="forbidden",
        )


if __name__ == "__main__":
    unittest.main()
