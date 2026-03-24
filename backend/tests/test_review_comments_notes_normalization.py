import unittest

from app.utils.legacy_normalization import norm_notes_by_element


class ReviewCommentsNotesNormalizationTests(unittest.TestCase):
    def test_norm_notes_by_element_preserves_review_comment_fields(self):
        raw = {
            "Task_1": {
                "items": [
                    {
                        "id": "c1",
                        "kind": "review_comment",
                        "text": "Проверить условие",
                        "status": "resolved",
                        "session_id": "s1",
                        "anchor_type": "node",
                        "anchor_id": "Task_1",
                        "anchor_label": "Task A",
                        "author_user_id": "u1",
                        "author_label": "reviewer@local",
                        "resolved_by_user_id": "u2",
                        "resolved_by_label": "owner@local",
                        "resolved_at": 1700000000000,
                        "createdAt": 1690000000000,
                        "updatedAt": 1700000000000,
                    }
                ],
                "updatedAt": 1700000000000,
            }
        }

        normalized = norm_notes_by_element(raw)
        self.assertIn("Task_1", normalized)
        items = normalized["Task_1"]["items"]
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item["kind"], "review_comment")
        self.assertEqual(item["status"], "resolved")
        self.assertEqual(item["session_id"], "s1")
        self.assertEqual(item["anchor_type"], "node")
        self.assertEqual(item["anchor_id"], "Task_1")
        self.assertEqual(item["author_user_id"], "u1")
        self.assertEqual(item["resolved_by_user_id"], "u2")
        self.assertEqual(item["resolved_at"], 1700000000000)

    def test_norm_notes_by_element_normalizes_reopened_to_open(self):
        raw = {
            "Flow_1": {
                "items": [
                    {
                        "id": "c2",
                        "kind": "review_comment",
                        "text": "Добавить ветку",
                        "status": "reopened",
                        "anchor_type": "sequence_flow",
                        "anchor_id": "Flow_1",
                    }
                ]
            }
        }
        normalized = norm_notes_by_element(raw)
        item = normalized["Flow_1"]["items"][0]
        self.assertEqual(item["status"], "open")
        self.assertEqual(item["anchor_type"], "sequence_flow")


if __name__ == "__main__":
    unittest.main()

