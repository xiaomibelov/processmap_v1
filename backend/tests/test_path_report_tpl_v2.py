import json
import unittest
from unittest.mock import patch

from app.ai.deepseek_questions import generate_path_report


def _payload() -> dict:
    return {
        "session_id": "sid_1",
        "path_id": "primary",
        "path_name": "P0",
        "generated_at": "2026-02-27T00:00:00.000Z",
        "totals": {
            "steps_count": 3,
            "work_total_sec": 120,
            "wait_total_sec": 30,
            "total_sec": 150,
        },
        "missing_fields_coverage": {
            "missing_work_duration_pct": 10.0,
            "missing_wait_duration_pct": 20.0,
            "missing_notes_pct": 30.0,
        },
        "steps": [
            {"order_index": 1, "title": "Start"},
            {"order_index": 2, "title": "Work"},
            {"order_index": 3, "title": "Finish"},
        ],
    }


class PathReportTplV2Tests(unittest.TestCase):
    @patch("app.ai.deepseek_questions._deepseek_chat_text")
    def test_v2_returns_structured_json_and_generates_markdown_fallback(self, mock_chat):
        mock_chat.return_value = json.dumps(
            {
                "title": "Structured Report",
                "summary": ["S1", "S2"],
                "kpis": {
                    "steps_count": 3,
                    "work_total_sec": 100,
                    "wait_total_sec": 40,
                    "total_sec": 140,
                    "coverage": {
                        "missing_work_duration_pct": 11.1,
                        "missing_wait_duration_pct": 22.2,
                        "missing_notes_pct": 33.3,
                    },
                },
                "bottlenecks": [
                    {"order_index": 2, "title": "Work", "reason": "Queue", "impact": "Delay"},
                ],
                "recommendations": [
                    {
                        "scope": "step",
                        "priority": "P0",
                        "order_index": 2,
                        "text": "Do faster",
                        "effect": "Less wait",
                        "effort": "Medium",
                    }
                ],
                "missing_data": [
                    {"order_index": 2, "missing": ["notes"]},
                ],
            },
            ensure_ascii=False,
        )

        out = generate_path_report(
            payload=_payload(),
            api_key="x",
            base_url="https://example.invalid",
            prompt_template_version="v2",
        )

        self.assertEqual(out.get("status"), "ok")
        self.assertEqual(out.get("prompt_template_version"), "v2")
        self.assertTrue(isinstance(out.get("report_json"), dict))
        self.assertEqual((out.get("report_json") or {}).get("title"), "Structured Report")
        self.assertEqual(len((out.get("report_json") or {}).get("summary") or []), 2)
        self.assertEqual(len(out.get("recommendations") or []), 1)
        self.assertEqual((out.get("recommendations") or [{}])[0].get("priority"), "P0")
        self.assertTrue(str(out.get("report_markdown") or "").strip())
        warnings = list(out.get("warnings") or [])
        self.assertIn("report_markdown_generated_from_json", warnings)
        self.assertEqual((out.get("raw_json") or {}).get("title"), "Structured Report")

    @patch("app.ai.deepseek_questions._deepseek_chat_text")
    def test_unsupported_template_falls_back_to_v2(self, mock_chat):
        mock_chat.return_value = json.dumps(
            {
                "title": "Fallback Report",
                "summary": ["Only one"],
                "kpis": {},
                "bottlenecks": [],
                "recommendations": [],
                "missing_data": [],
            },
            ensure_ascii=False,
        )

        out = generate_path_report(
            payload=_payload(),
            api_key="x",
            base_url="https://example.invalid",
            prompt_template_version="v999",
        )

        self.assertEqual(out.get("prompt_template_version"), "v2")
        warnings = list(out.get("warnings") or [])
        self.assertIn("unsupported_prompt_template_version_fallback_v2", warnings)

    @patch("app.ai.deepseek_questions._deepseek_chat_text")
    def test_v2_salvages_report_markdown_from_invalid_json_text(self, mock_chat):
        mock_chat.return_value = """```json
{
  "report_markdown": "## Анализ процесса
- Критерий: "готово"
- Путь: P0 Ideal
- Шагов: 60"
}
```"""

        out = generate_path_report(
            payload=_payload(),
            api_key="x",
            base_url="https://example.invalid",
            prompt_template_version="v2",
        )

        self.assertEqual(out.get("status"), "ok")
        self.assertEqual(out.get("prompt_template_version"), "v2")
        markdown = str(out.get("report_markdown") or "")
        self.assertIn("## Анализ процесса", markdown)
        self.assertIn("Критерий: \"готово\"", markdown)
        self.assertIn("- Путь: P0 Ideal", markdown)
        warnings = list(out.get("warnings") or [])
        self.assertIn("json_parse_failed", warnings)
        self.assertIn("invalid_json_object", warnings)
        self.assertIn("report_markdown_salvaged_from_raw", warnings)
        self.assertEqual((out.get("report_json") or {}).get("kpis", {}).get("steps_count"), 3)


if __name__ == "__main__":
    unittest.main()
