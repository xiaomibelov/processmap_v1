import {
  apiListRecipes,
  apiListIngredients,
  apiCreateRecipe,
  apiCalculateRecipe,
} from "../../../../lib/api.js";

export async function fetchRecipes() {
  const res = await apiListRecipes();
  if (!res.ok) throw new Error(res.error || "failed to load recipes");
  return res.recipes || [];
}

export async function fetchIngredients() {
  const res = await apiListIngredients();
  if (!res.ok) throw new Error(res.error || "failed to load ingredients");
  return res.ingredients || [];
}

export async function createRecipe(payload) {
  const res = await apiCreateRecipe(payload);
  if (!res.ok) throw new Error(res.error || "failed to create recipe");
  return res.recipe;
}

export async function calculateRecipe({ recipeId, targetPortions }) {
  const res = await apiCalculateRecipe(recipeId, targetPortions);
  if (!res.ok) throw new Error(res.error || "failed to calculate recipe");
  return res.calculation;
}
