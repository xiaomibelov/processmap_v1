import unittest
from unittest.mock import patch


class _FakeRedis:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(str(key))

    def set(self, key, value, ex=None):
        _ = ex
        self.store[str(key)] = str(value)
        return True

    def setex(self, key, ttl, value):
        _ = ttl
        self.store[str(key)] = str(value)
        return True


class OverlayProjectionCacheTest(unittest.TestCase):
    def test_build_projection_extracts_camunda_io_and_properties(self):
        from app.services.overlay_projection_cache import build_properties_overlay_projection

        extension_state = {
            "properties": {
                "extensionProperties": [
                    {"id": "p1", "name": "tara", "value": "Шпилька"},
                    {"id": "p2", "name": "container_type", "value": "Противень"},
                ],
                "extensionListeners": [],
            },
            "preservedExtensionElements": [
                (
                    '<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">'
                    '<camunda:inputOutput>'
                    '<camunda:inputParameter name="url">http://example.local/api</camunda:inputParameter>'
                    '<camunda:inputParameter name="method">POST</camunda:inputParameter>'
                    '<camunda:outputParameter name="response">${response}</camunda:outputParameter>'
                    '<camunda:outputParameter name="payload"><foo><bar>42</bar></foo></camunda:outputParameter>'
                    '</camunda:inputOutput>'
                    '</camunda:connector>'
                )
            ],
        }
        bpmn_meta = {
            "camunda_extensions_by_element_id": {
                "Task_1": extension_state,
            }
        }

        projection = build_properties_overlay_projection(bpmn_meta, visible_limit=4)
        self.assertEqual(projection.get("schema"), "properties_overlay_projection_v1")
        self.assertEqual(int(projection.get("entry_count") or 0), 1)
        entries = projection.get("entries_by_element_id") or {}
        self.assertIn("Task_1", entries)

        entry = entries["Task_1"]
        self.assertEqual(entry.get("enabled"), True)
        self.assertRegex(str(entry.get("source_hash") or ""), r"^[0-9a-f]{8}$")
        items = entry.get("items") or []
        self.assertEqual(len(items), 4)
        self.assertEqual(int(entry.get("hiddenCount") or 0), 2)

        labels = [str(row.get("label") or "") for row in items]
        self.assertIn("IN url", labels)
        self.assertIn("IN method", labels)
        self.assertIn("OUT response", labels)
        self.assertIn("OUT payload", labels)

    def test_cache_is_version_token_scoped(self):
        from app.services.overlay_projection_cache import (
            get_or_build_properties_overlay_projection_cached,
            overlay_projection_cache_key,
        )

        fake = _FakeRedis()
        base_meta = {
            "camunda_extensions_by_element_id": {
                "Task_1": {
                    "properties": {
                        "extensionProperties": [
                            {"id": "p1", "name": "tara", "value": "A"},
                        ],
                        "extensionListeners": [],
                    },
                    "preservedExtensionElements": [],
                }
            }
        }

        with patch("app.redis_cache.get_client", return_value=fake):
            payload_v1 = get_or_build_properties_overlay_projection_cached(
                session_id="s1",
                version_token="1.1.1",
                bpmn_meta_raw=base_meta,
                visible_limit=4,
            )
            key_v1 = overlay_projection_cache_key("s1", "1.1.1")
            self.assertIn(key_v1, fake.store)

            mutated_meta = {
                "camunda_extensions_by_element_id": {
                    "Task_1": {
                        "properties": {
                            "extensionProperties": [
                                {"id": "p1", "name": "tara", "value": "B"},
                            ],
                            "extensionListeners": [],
                        },
                        "preservedExtensionElements": [],
                    }
                }
            }

            # Same version token should return cached projection snapshot.
            payload_v1_cached = get_or_build_properties_overlay_projection_cached(
                session_id="s1",
                version_token="1.1.1",
                bpmn_meta_raw=mutated_meta,
                visible_limit=4,
            )
            value_v1 = (
                (((payload_v1.get("entries_by_element_id") or {}).get("Task_1") or {}).get("items") or [{}])[0]
                .get("value")
            )
            value_v1_cached = (
                (((payload_v1_cached.get("entries_by_element_id") or {}).get("Task_1") or {}).get("items") or [{}])[0]
                .get("value")
            )
            self.assertEqual(value_v1_cached, value_v1)

            # New version token should trigger rebuild.
            payload_v2 = get_or_build_properties_overlay_projection_cached(
                session_id="s1",
                version_token="1.1.2",
                bpmn_meta_raw=mutated_meta,
                visible_limit=4,
            )
            value_v2 = (
                (((payload_v2.get("entries_by_element_id") or {}).get("Task_1") or {}).get("items") or [{}])[0]
                .get("value")
            )
            self.assertEqual(value_v2, "B")

    def test_degraded_mode_without_redis_still_builds_projection(self):
        from app.services.overlay_projection_cache import get_or_build_properties_overlay_projection_cached

        meta = {
            "camunda_extensions_by_element_id": {
                "Task_1": {
                    "properties": {
                        "extensionProperties": [
                            {"id": "p1", "name": "tara", "value": "A"},
                        ],
                        "extensionListeners": [],
                    },
                    "preservedExtensionElements": [],
                }
            }
        }
        with patch("app.redis_cache.get_client", return_value=None):
            payload = get_or_build_properties_overlay_projection_cached(
                session_id="s1",
                version_token="1.1.1",
                bpmn_meta_raw=meta,
                visible_limit=4,
            )
        entries = (payload.get("entries_by_element_id") or {})
        self.assertIn("Task_1", entries)
        task_row = entries["Task_1"]
        self.assertEqual(task_row.get("enabled"), True)
        self.assertEqual((task_row.get("items") or [{}])[0].get("label"), "tara")


if __name__ == "__main__":
    unittest.main()
