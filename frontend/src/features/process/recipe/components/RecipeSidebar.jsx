import { useMemo, useState } from "react";
import { useCreateRecipe, useIngredients, useRecipes } from "../api/useRecipeQueries.js";
import IngredientsTable from "./IngredientsTable.jsx";
import RecipeCalculator from "./RecipeCalculator.jsx";
import RecipeSelector from "./RecipeSelector.jsx";

export default function RecipeSidebar({ selectedElementType = "" }) {
  const normalizedType = String(selectedElementType || "").toLowerCase();
  const isTask = normalizedType === "bpmn:task" || normalizedType === "bpmn:usertask";
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes();
  const { data: ingredients = [], isLoading: ingredientsLoading } = useIngredients();
  const createRecipe = useCreateRecipe();

  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: "", base_portions: "", ingredients: [] });

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId]
  );

  function addIngredientRow() {
    setNewRecipe((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { ingredient_id: "", quantity: "" }],
    }));
  }

  function updateIngredientRow(index, patch) {
    setNewRecipe((prev) => {
      const rows = [...prev.ingredients];
      rows[index] = { ...rows[index], ...patch };
      return { ...prev, ingredients: rows };
    });
  }

  function removeIngredientRow(index) {
    setNewRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  }

  function handleCreate(event) {
    event.preventDefault();
    const payload = {
      name: newRecipe.name.trim(),
      base_portions: Number(newRecipe.base_portions) || 1,
      ingredients: newRecipe.ingredients
        .filter((row) => row.ingredient_id && Number(row.quantity) > 0)
        .map((row) => ({
          ingredient_id: row.ingredient_id,
          quantity: Number(row.quantity),
        })),
    };
    createRecipe.mutate(payload, {
      onSuccess: (recipe) => {
        setSelectedRecipeId(recipe.id);
        setShowCreate(false);
        setNewRecipe({ name: "", base_portions: "", ingredients: [] });
      },
    });
  }

  if (!isTask) {
    return null;
  }

  const loading = recipesLoading || ingredientsLoading;

  return (
    <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary" data-testid="recipe-sidebar">
      <div className="sidebarPropertiesBlockHead">
        <button
          type="button"
          className="sidebarPropertiesBlockToggle"
          aria-expanded="true"
        >
          <span className="sidebarPropertiesBlockTitle">Калькулятор рецепта</span>
        </button>
      </div>
      <div className="mt-1 space-y-2">
        <RecipeSelector
          recipes={recipes}
          value={selectedRecipeId}
          onChange={setSelectedRecipeId}
          loading={recipesLoading}
        />
        {selectedRecipe ? (
          <>
            <div className="text-[11px] text-muted">
              Базовых порций: <span className="text-fg">{selectedRecipe.base_portions}</span>
            </div>
            <IngredientsTable ingredients={selectedRecipe.ingredients || []} />
            <RecipeCalculator recipe={selectedRecipe} />
          </>
        ) : null}

        <div className="sidebarButtonRow">
          <button
            type="button"
            className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
            onClick={() => setShowCreate((prev) => !prev)}
            disabled={loading}
          >
            {showCreate ? "Отмена" : "+ Создать рецепт"}
          </button>
        </div>

        {showCreate ? (
          <form onSubmit={handleCreate} className="rounded-md border border-border/60 bg-panel2/40 p-2 space-y-2">
            <label className="sidebarBpmnEditorField">
              <span className="sidebarBpmnEditorLabel">Название</span>
              <input
                className="input w-full min-w-0"
                value={newRecipe.name}
                onChange={(event) => setNewRecipe((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className="sidebarBpmnEditorField">
              <span className="sidebarBpmnEditorLabel">Базовых порций</span>
              <input
                type="number"
                min={1}
                className="input w-full min-w-0"
                value={newRecipe.base_portions}
                onChange={(event) => setNewRecipe((prev) => ({ ...prev, base_portions: event.target.value }))}
                required
              />
            </label>
            <div className="space-y-1">
              <div className="text-[11px] text-muted">Ингредиенты</div>
              {newRecipe.ingredients.map((row, index) => (
                <div key={index} className="flex items-center gap-1">
                  <select
                    className="select min-w-0 flex-1 text-xs"
                    value={row.ingredient_id}
                    onChange={(event) => updateIngredientRow(index, { ingredient_id: event.target.value })}
                    required
                  >
                    <option value="">Ингредиент</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    className="input w-20 min-w-0 text-xs"
                    value={row.quantity}
                    onChange={(event) => updateIngredientRow(index, { quantity: event.target.value })}
                    placeholder="кол-во"
                    required
                  />
                  <button
                    type="button"
                    className="secondaryBtn sidebarPropertiesIconBtn sidebarPropertiesIconBtn--danger"
                    onClick={() => removeIngredientRow(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondaryBtn sidebarPropertiesActionBtn px-2.5 text-xs"
                onClick={addIngredientRow}
              >
                + Ингредиент
              </button>
            </div>
            <div className="sidebarButtonRow">
              <button
                type="submit"
                className="primaryBtn sidebarPropertiesActionBtn px-2.5"
                disabled={createRecipe.isPending}
              >
                {createRecipe.isPending ? "Создаю..." : "Создать"}
              </button>
            </div>
            {createRecipe.error ? (
              <div className="selectedNodeFieldError">{createRecipe.error.message}</div>
            ) : null}
          </form>
        ) : null}
      </div>
    </section>
  );
}
