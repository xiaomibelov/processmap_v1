import unittest

from app.camunda_meta_utils import deduplicate_camunda_extension_properties


class TestDeduplicateCamundaExtensionProperties(unittest.TestCase):
    def test_preserves_duplicate_property_names(self):
        meta = {
            "camunda_extensions_by_element_id": {
                "Activity_1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "equipment", "value": "Весы"},
                            {"name": "equipment", "value": "Миксер"},
                            {"name": "equipment", "value": "Плита"},
                            {"name": "container", "value": "Лоток"},
                        ],
                    },
                },
            },
        }
        result = deduplicate_camunda_extension_properties(meta)
        props = result["camunda_extensions_by_element_id"]["Activity_1"]["properties"]["extensionProperties"]
        self.assertEqual(
            props,
            [
                {"name": "equipment", "value": "Весы"},
                {"name": "equipment", "value": "Миксер"},
                {"name": "equipment", "value": "Плита"},
                {"name": "container", "value": "Лоток"},
            ],
        )

    def test_preserves_case_differences(self):
        meta = {
            "camunda_extensions_by_element_id": {
                "Activity_1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "Equipment", "value": "A"},
                            {"name": "EQUIPMENT", "value": "B"},
                        ],
                    },
                },
            },
        }
        result = deduplicate_camunda_extension_properties(meta)
        props = result["camunda_extensions_by_element_id"]["Activity_1"]["properties"]["extensionProperties"]
        self.assertEqual(
            props,
            [
                {"name": "Equipment", "value": "A"},
                {"name": "EQUIPMENT", "value": "B"},
            ],
        )

    def test_empty_and_missing_names_preserved(self):
        meta = {
            "camunda_extensions_by_element_id": {
                "Activity_1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "equipment", "value": "A"},
                            {"name": "", "value": "blank"},
                            {"name": "equipment", "value": "B"},
                        ],
                    },
                },
            },
        }
        result = deduplicate_camunda_extension_properties(meta)
        props = result["camunda_extensions_by_element_id"]["Activity_1"]["properties"]["extensionProperties"]
        self.assertEqual(
            props,
            [
                {"name": "equipment", "value": "A"},
                {"name": "", "value": "blank"},
                {"name": "equipment", "value": "B"},
            ],
        )

    def test_no_camunda_extensions_unchanged(self):
        meta = {"version": 1}
        self.assertEqual(deduplicate_camunda_extension_properties(meta), meta)


if __name__ == "__main__":
    unittest.main()
