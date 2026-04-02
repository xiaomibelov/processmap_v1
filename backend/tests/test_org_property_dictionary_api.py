import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class OrgPropertyDictionaryApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_user
        from app.routers.org_property_dictionary import (
            DefinitionUpsertIn,
            OperationUpsertIn,
            ValueUpsertIn,
            create_or_update_org_property_dictionary_definition_endpoint,
            create_or_update_org_property_dictionary_operation_endpoint,
            create_or_update_org_property_dictionary_value_endpoint,
            get_org_property_dictionary_bundle_endpoint,
            list_org_property_dictionary_operations_endpoint,
        )
        from app.storage import create_org_record, get_default_org_id, get_storage, upsert_org_membership

        self.create_user = create_user
        self.OperationUpsertIn = OperationUpsertIn
        self.DefinitionUpsertIn = DefinitionUpsertIn
        self.ValueUpsertIn = ValueUpsertIn
        self.create_operation = create_or_update_org_property_dictionary_operation_endpoint
        self.create_definition = create_or_update_org_property_dictionary_definition_endpoint
        self.create_value = create_or_update_org_property_dictionary_value_endpoint
        self.get_bundle = get_org_property_dictionary_bundle_endpoint
        self.list_operations = list_org_property_dictionary_operations_endpoint
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id
        self.upsert_org_membership = upsert_org_membership
        _ = get_storage()

        self.user_a = create_user("dict_a@local", "pw", is_admin=False)
        self.user_b = create_user("dict_b@local", "pw", is_admin=False)
        self.user_c = create_user("dict_c@local", "pw", is_admin=False)
        self.org_a = get_default_org_id()
        self.org_b = str(create_org_record("Second Org", created_by=str(self.user_a.get("id") or "")).get("id") or "")

        self.upsert_org_membership(self.org_a, str(self.user_a.get("id") or ""), "viewer")
        self.upsert_org_membership(self.org_a, str(self.user_b.get("id") or ""), "editor")
        self.upsert_org_membership(self.org_b, str(self.user_c.get("id") or ""), "viewer")

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _req(self, user: dict, org_id: str) -> _DummyRequest:
        return _DummyRequest(user, active_org_id=org_id)

    def test_any_org_member_can_create_and_read_dictionary_entries(self):
        req = self._req(self.user_a, self.org_a)
        created_operation = self.create_operation(
            self.org_a,
            self.OperationUpsertIn(
                operation_key="set_container",
                operation_label="Set container",
                sort_order=10,
            ),
            req,
        )
        self.assertEqual(str((created_operation.get("item") or {}).get("operation_key") or ""), "set_container")

        created_definition = self.create_definition(
            self.org_a,
            "set_container",
            self.DefinitionUpsertIn(
                property_key="container",
                property_label="Container",
                input_mode="autocomplete",
                allow_custom_value=True,
                required=False,
                sort_order=5,
            ),
            req,
        )
        self.assertEqual(str((created_definition.get("item") or {}).get("property_key") or ""), "container")

        created_value = self.create_value(
            self.org_a,
            "set_container",
            "container",
            self.ValueUpsertIn(option_value="Лоток 150x55", sort_order=1),
            req,
        )
        self.assertEqual(str((created_value.get("item") or {}).get("option_value") or ""), "Лоток 150x55")

        same_org_req = self._req(self.user_b, self.org_a)
        bundle = self.get_bundle(self.org_a, "set_container", same_org_req)
        properties = bundle.get("properties") or []
        self.assertEqual(len(properties), 1)
        self.assertEqual(str(properties[0].get("property_key") or ""), "container")
        self.assertEqual(str(((properties[0].get("options") or [{}])[0].get("option_value") or "")), "Лоток 150x55")

    def test_dictionary_is_isolated_by_org(self):
        req_a = self._req(self.user_a, self.org_a)
        self.create_operation(
            self.org_a,
            self.OperationUpsertIn(operation_key="set_container", operation_label="Set container"),
            req_a,
        )
        self.create_definition(
            self.org_a,
            "set_container",
            self.DefinitionUpsertIn(property_key="container", property_label="Container"),
            req_a,
        )
        self.create_value(
            self.org_a,
            "set_container",
            "container",
            self.ValueUpsertIn(option_value="Лоток 150x55"),
            req_a,
        )

        req_b = self._req(self.user_c, self.org_b)
        bundle_b = self.get_bundle(self.org_b, "set_container", req_b)
        self.assertEqual(bundle_b.get("org_id"), self.org_b)
        self.assertEqual(bundle_b.get("properties"), [])

        operations_b = self.list_operations(self.org_b, req_b)
        self.assertEqual(int(operations_b.get("count") or 0), 0)

    def test_bundle_returns_nested_schema_for_management_surface(self):
        req = self._req(self.user_b, self.org_a)
        self.create_operation(
            self.org_a,
            self.OperationUpsertIn(operation_key="add_ingredient", operation_label="Add ingredient", sort_order=1),
            req,
        )
        self.create_definition(
            self.org_a,
            "add_ingredient",
            self.DefinitionUpsertIn(property_key="ingredient", property_label="Ingredient", sort_order=1),
            req,
        )
        self.create_definition(
            self.org_a,
            "add_ingredient",
            self.DefinitionUpsertIn(property_key="equipment", property_label="Equipment", sort_order=2, input_mode="free_text"),
            req,
        )
        self.create_value(
            self.org_a,
            "add_ingredient",
            "ingredient",
            self.ValueUpsertIn(option_value="Картошка", sort_order=1),
            req,
        )
        self.create_value(
            self.org_a,
            "add_ingredient",
            "ingredient",
            self.ValueUpsertIn(option_value="Капуста", sort_order=2),
            req,
        )

        bundle = self.get_bundle(self.org_a, "add_ingredient", req)
        self.assertEqual(str((bundle.get("operation") or {}).get("operation_label") or ""), "Add ingredient")
        properties = bundle.get("properties") or []
        self.assertEqual([str(row.get("property_key") or "") for row in properties], ["ingredient", "equipment"])
        self.assertEqual([str(row.get("input_mode") or "") for row in properties], ["autocomplete", "free_text"])
        ingredient_options = properties[0].get("options") or []
        self.assertEqual([str(row.get("option_value") or "") for row in ingredient_options], ["Картошка", "Капуста"])


if __name__ == "__main__":
    unittest.main()
