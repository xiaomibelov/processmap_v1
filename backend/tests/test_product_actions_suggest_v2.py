import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class ProductActionsSuggestV2Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "product_actions_v2.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._PG_POOL = None

    def tearDown(self):
        if self.old_process_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_process_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_project_storage_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_project_storage_dir
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        if self.old_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._PG_POOL = None
        self.tmp.cleanup()

    def test_normalize_includes_action_text(self):
        from app.ai.product_actions_suggest import normalize_product_action_suggestion

        result = normalize_product_action_suggestion(
            {
                "action_text": "Перелить суп в гастроёмкость",
                "action_type": "перетаривание",
                "action_stage": "до разогрева",
                "action_object": "суп",
                "action_method": "перелить",
            },
            index=0,
        )
        self.assertEqual(result.get("action_text"), "Перелить суп в гастроёмкость")
        self.assertEqual(result.get("missing_fields"), [])

    def test_missing_action_text_is_reported(self):
        from app.ai.product_actions_suggest import normalize_product_action_suggestion

        result = normalize_product_action_suggestion(
            {
                "action_type": "перетаривание",
                "action_stage": "до разогрева",
                "action_object": "суп",
                "action_method": "перелить",
            },
            index=0,
        )
        self.assertIn("action_text", result.get("missing_fields"))
        self.assertNotIn("product_name", result.get("missing_fields"))
        self.assertNotIn("product_group", result.get("missing_fields"))

    def test_missing_any_tag_is_reported(self):
        from app.ai.product_actions_suggest import normalize_product_action_suggestion

        base = {
            "action_text": "Нарезать курицу",
            "action_type": "нарезка",
            "action_stage": "подготовка",
            "action_object": "курица",
            "action_method": "ножом",
        }
        for key in ("action_type", "action_stage", "action_object", "action_method"):
            incomplete = {**base, key: ""}
            result = normalize_product_action_suggestion(incomplete, index=0)
            self.assertIn(key, result.get("missing_fields"), f"{key} should be missing")
            self.assertNotIn("product_name", result.get("missing_fields"))
            self.assertNotIn("product_group", result.get("missing_fields"))

    def test_product_name_and_group_missing_are_not_required(self):
        from app.ai.product_actions_suggest import normalize_product_action_suggestion

        result = normalize_product_action_suggestion(
            {
                "action_text": "Упаковать сэндвич",
                "action_type": "упаковка",
                "action_stage": "финиш",
                "action_object": "сэндвич",
                "action_method": "в коробку",
            },
            index=0,
        )
        self.assertEqual(result.get("product_name"), "")
        self.assertEqual(result.get("product_group"), "")
        self.assertEqual(result.get("missing_fields"), [])

    def test_v4_prompt_requires_action_text(self):
        from app.ai.product_actions_suggest import PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4

        self.assertIn("action_text", PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4)
        self.assertIn("глагольная формулировка", PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4.lower())

    def test_parse_markdown_fenced_response(self):
        from app.ai.product_actions_suggest import parse_product_actions_suggestions

        raw = (
            "Вот результат:\n\n"
            "```json\n"
            '{"suggestions":[{"action_text":"Перелить суп","action_type":"перетаривание",'
            '"action_stage":"до разогрева","action_object":"суп","action_method":"перелить"}]}'
            "\n```\n\nНадеюсь, это поможет."
        )
        result = parse_product_actions_suggestions(raw)
        self.assertEqual(len(result["suggestions"]), 1)
        self.assertEqual(result["suggestions"][0]["action_text"], "Перелить суп")

    def test_parse_text_around_json_response(self):
        from app.ai.product_actions_suggest import parse_product_actions_suggestions

        raw = (
            "Конечно, вот JSON:\n"
            '{"suggestions":[{"action_text":"Нарезать курицу","action_type":"нарезка",'
            '"action_stage":"подготовка","action_object":"курица","action_method":"ножом"}]}'
            "\nЕсли нужно что-то ещё, дайте знать."
        )
        result = parse_product_actions_suggestions(raw)
        self.assertEqual(len(result["suggestions"]), 1)
        self.assertEqual(result["suggestions"][0]["action_object"], "курица")

    def test_parse_truncated_response_repairs_valid_prefix(self):
        from app.ai.product_actions_suggest import parse_product_actions_suggestions

        # Simulate max_tokens cut-off mid-object.
        raw = (
            '{"suggestions":[{"action_text":"Перелить суп","action_type":"перетаривание",'
            '"action_stage":"до разогрева","action_object":"суп","action_method":"перелить"}],'
            '"warnings":[]'
        )
        result = parse_product_actions_suggestions(raw)
        self.assertEqual(len(result["suggestions"]), 1)
        self.assertEqual(result["suggestions"][0]["action_method"], "перелить")

    def test_parse_invalid_json_raises_with_raw_content(self):
        from app.ai.product_actions_suggest import (
            ProductActionsAiResponseParseError,
            parse_product_actions_suggestions,
        )

        with self.assertRaises(ProductActionsAiResponseParseError) as ctx:
            parse_product_actions_suggestions("Это просто текст без JSON.")
        self.assertTrue(hasattr(ctx.exception, "raw_content"))
        self.assertIn("без JSON", str(ctx.exception.raw_content))

    def test_parse_actions_wrapper_response(self):
        from app.ai.product_actions_suggest import parse_product_actions_suggestions

        raw = json.dumps(
            {
                "actions": [
                    {
                        "action_text": "Перелить суп",
                        "action_type": "перетаривание",
                        "action_stage": "до разогрева",
                        "action_object": "суп",
                        "action_method": "перелить",
                    }
                ]
            },
            ensure_ascii=False,
        )
        result = parse_product_actions_suggestions(raw)
        self.assertEqual(len(result["suggestions"]), 1)
        self.assertEqual(result["suggestions"][0]["action_text"], "Перелить суп")

    def test_parse_items_wrapper_response(self):
        from app.ai.product_actions_suggest import parse_product_actions_suggestions

        raw = json.dumps(
            {
                "items": [
                    {
                        "action_text": "Нарезать курицу",
                        "action_type": "нарезка",
                        "action_stage": "подготовка",
                        "action_object": "курица",
                        "action_method": "ножом",
                    }
                ]
            },
            ensure_ascii=False,
        )
        result = parse_product_actions_suggestions(raw)
        self.assertEqual(len(result["suggestions"]), 1)
        self.assertEqual(result["suggestions"][0]["action_object"], "курица")

    def test_parse_empty_array_response(self):
        from app.ai.product_actions_suggest import parse_product_actions_suggestions

        result = parse_product_actions_suggestions('{"suggestions": []}')
        self.assertEqual(result["suggestions"], [])


if __name__ == "__main__":
    unittest.main()
