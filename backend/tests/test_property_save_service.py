"""Unit tests for property_save_service."""

from __future__ import annotations

import unittest

from app.save_services.property_save.property_save_service import (
    _deduplicate_camunda_extension_properties,
    _merge_meta,
)


class CamundaExtensionPropertyDedupTests(unittest.TestCase):
    def test_empty_map(self):
        self.assertEqual(_deduplicate_camunda_extension_properties({}), {})

    def test_preserves_duplicate_property_names(self):
        src = {
            "Activity_1": {
                "properties": {
                    "extensionProperties": [
                        {"name": "color", "value": "red"},
                        {"name": "color", "value": "blue"},
                    ],
                },
            },
        }
        result = _deduplicate_camunda_extension_properties(src)
        self.assertEqual(
            result["Activity_1"]["properties"]["extensionProperties"],
            [
                {"name": "color", "value": "red"},
                {"name": "color", "value": "blue"},
            ],
        )

    def test_multiple_elements_preserved(self):
        src = {
            "A": {
                "properties": {
                    "extensionProperties": [
                        {"name": "x", "value": "1"},
                        {"name": "x", "value": "2"},
                    ],
                },
            },
            "B": {
                "properties": {
                    "extensionProperties": [
                        {"name": "y", "value": "a"},
                    ],
                },
            },
        }
        result = _deduplicate_camunda_extension_properties(src)
        self.assertEqual(
            result["A"]["properties"]["extensionProperties"],
            [
                {"name": "x", "value": "1"},
                {"name": "x", "value": "2"},
            ],
        )
        self.assertEqual(result["B"]["properties"]["extensionProperties"], [{"name": "y", "value": "a"}])

    def test_ignores_rows_without_name(self):
        src = {
            "A": {
                "properties": {
                    "extensionProperties": [
                        {"value": "orphan"},
                        {"name": "ok", "value": "yes"},
                    ],
                },
            },
        }
        result = _deduplicate_camunda_extension_properties(src)
        self.assertEqual(
            result["A"]["properties"]["extensionProperties"],
            [{"value": "orphan"}, {"name": "ok", "value": "yes"}],
        )


class MergeMetaTests(unittest.TestCase):
    def test_merge_overwrites_top_level_keys(self):
        current = {"version": 1, "flow_meta": {"a": {"tier": "P1"}}}
        incoming = {"flow_meta": {"b": {"tier": "P2"}}}
        merged = _merge_meta(current, incoming)
        self.assertEqual(merged["flow_meta"], {"b": {"tier": "P2"}})

    def test_merge_preserves_duplicate_camunda_extensions(self):
        current = {
            "version": 1,
            "camunda_extensions_by_element_id": {
                "A": {
                    "properties": {
                        "extensionProperties": [{"name": "old", "value": "1"}],
                    },
                },
            },
        }
        incoming = {
            "camunda_extensions_by_element_id": {
                "A": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "new", "value": "2"},
                            {"name": "new", "value": "3"},
                        ],
                    },
                },
            },
        }
        merged = _merge_meta(current, incoming)
        self.assertEqual(
            merged["camunda_extensions_by_element_id"]["A"]["properties"]["extensionProperties"],
            [
                {"name": "new", "value": "2"},
                {"name": "new", "value": "3"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
