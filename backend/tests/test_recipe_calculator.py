import os
import tempfile
import unittest


class RecipeCalculatorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_DB_PATH"] = os.path.join(self.tmp.name, "test.db")

        from app.storage import _ensure_schema, get_default_org_id
        from app.recipe.storage import (
            create_ingredient,
            create_recipe,
            calculate_recipe,
            get_recipe,
            get_ingredient_values_by_name,
        )

        _ensure_schema()
        self.org_id = get_default_org_id()
        self.user_id = "test_user"
        self.create_ingredient = create_ingredient
        self.create_recipe = create_recipe
        self.calculate_recipe = calculate_recipe
        self.get_recipe = get_recipe
        self.get_ingredient_values_by_name = get_ingredient_values_by_name

    def tearDown(self):
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp.cleanup()

    def _make_borsch(self):
        beet = self.create_ingredient({"name": "Свёкла", "unit": "кг"}, self.org_id, self.user_id)
        water = self.create_ingredient({"name": "Вода", "unit": "л"}, self.org_id, self.user_id)
        recipe = self.create_recipe(
            {
                "name": "Борщ",
                "description": "Классический",
                "base_portions": 10,
                "ingredients": [
                    {"ingredient_id": beet["id"], "quantity": 1.0},
                    {"ingredient_id": water["id"], "quantity": 2.0},
                ],
            },
            self.org_id,
            self.user_id,
        )
        return recipe

    def test_create_recipe_and_read_with_ingredients(self):
        recipe = self._make_borsch()
        loaded = self.get_recipe(recipe["id"], self.org_id)
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["name"], "Борщ")
        self.assertEqual(loaded["base_portions"], 10)
        self.assertEqual(len(loaded["ingredients"]), 2)
        names = {row["ingredient"]["name"] for row in loaded["ingredients"]}
        self.assertEqual(names, {"Свёкла", "Вода"})

    def test_calculate_for_25_portions(self):
        recipe = self._make_borsch()
        calc = self.calculate_recipe(recipe["id"], 25, self.org_id, self.user_id)
        self.assertEqual(calc["base_portions"], 10)
        self.assertEqual(calc["target_portions"], 25)
        self.assertAlmostEqual(calc["coefficient"], 2.5)
        by_name = {row["name"]: row for row in calc["results"]}
        self.assertAlmostEqual(by_name["Свёкла"]["target_quantity"], 2.5)
        self.assertAlmostEqual(by_name["Вода"]["target_quantity"], 5.0)

    def test_calculate_for_one_portion(self):
        recipe = self._make_borsch()
        calc = self.calculate_recipe(recipe["id"], 1, self.org_id, self.user_id)
        self.assertEqual(calc["target_portions"], 1)
        self.assertAlmostEqual(calc["coefficient"], 0.1)
        by_name = {row["name"]: row for row in calc["results"]}
        self.assertAlmostEqual(by_name["Свёкла"]["target_quantity"], 0.1)

    def test_ingredient_value_lookup_by_name(self):
        # value round-trips through create_ingredient and the bulk map is
        # case-insensitive and skips ingredients without a numeric value.
        self.create_ingredient(
            {"name": "Рис", "unit": "кг", "value": 1.2}, self.org_id, self.user_id
        )
        self.create_ingredient(
            {"name": "Вода", "unit": "л"}, self.org_id, self.user_id
        )
        by_name = self.get_ingredient_values_by_name(self.org_id)
        self.assertAlmostEqual(by_name["рис"], 1.2)
        self.assertAlmostEqual(by_name["РИС".lower()], 1.2)
        self.assertNotIn("вода", by_name)

    def test_catalog_value_column_migration_is_idempotent(self):
        # _ensure_recipe_tables runs on every connection; the column must exist
        # and re-opening must not raise (duplicate-column guard).
        from app.recipe.storage import _get_connection

        with _get_connection() as con:
            cols = {row[1] for row in con.execute("PRAGMA table_info(recipe_ingredient_catalog)")}
        self.assertIn("value", cols)
