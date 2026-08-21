export default function RecipeSelector({ recipes = [], value = "", onChange, loading = false }) {
  return (
    <label className="sidebarBpmnEditorField">
      <span className="sidebarBpmnEditorLabel">Рецепт</span>
      <select
        className="select w-full min-w-0"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? "Загрузка..." : "Выберите рецепт"}</option>
        {recipes.map((recipe) => (
          <option key={recipe.id} value={recipe.id}>
            {recipe.name}
            {recipe.base_portions ? ` (${recipe.base_portions} порц.)` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
