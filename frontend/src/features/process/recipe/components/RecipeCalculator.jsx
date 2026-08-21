import { useState } from "react";
import { useCalculateRecipe } from "../api/useRecipeQueries.js";

export default function RecipeCalculator({ recipe }) {
  const [targetPortions, setTargetPortions] = useState("");
  const calculate = useCalculateRecipe();
  const calculation = calculate.data;
  const busy = calculate.isPending;

  function handleCalculate() {
    if (!recipe?.id || !targetPortions) return;
    calculate.mutate({ recipeId: recipe.id, targetPortions: Number(targetPortions) });
  }

  return (
    <div className="mt-2 space-y-2">
      <label className="sidebarBpmnEditorField">
        <span className="sidebarBpmnEditorLabel">Целевое количество порций</span>
        <input
          type="number"
          min={1}
          className="input w-full min-w-0"
          value={targetPortions}
          onChange={(event) => setTargetPortions(event.target.value)}
          placeholder={recipe?.base_portions ? `база ${recipe.base_portions}` : "25"}
        />
      </label>
      <div className="sidebarButtonRow">
        <button
          type="button"
          className="primaryBtn sidebarPropertiesActionBtn px-2.5"
          onClick={handleCalculate}
          disabled={busy || !recipe?.id || !targetPortions}
        >
          {busy ? "Считаю..." : "Рассчитать"}
        </button>
      </div>
      {calculation ? (
        <div className="rounded-md border border-border/60 bg-panel2/40 p-2">
          <div className="mb-1 text-[11px] text-muted">
            Коэффициент: <span className="font-medium text-fg">{calculation.coefficient.toFixed(4)}</span>
          </div>
          <div className="sidebarPropertiesRows sidebarPropertiesRows--table">
            <div className="sidebarPropertiesTableHead" role="presentation">
              <span>Ингредиент</span>
              <span>База</span>
              <span>Цель</span>
            </div>
            {calculation.results.map((result, index) => (
              <div key={String(result.ingredient_id || index)} className="sidebarPropertiesTableRow">
                <span className="text-xs">{result.name}</span>
                <span className="text-xs">{result.base_quantity}</span>
                <span className="text-xs font-medium">{result.target_quantity}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {calculate.error ? (
        <div className="selectedNodeFieldError">{calculate.error.message}</div>
      ) : null}
    </div>
  );
}
