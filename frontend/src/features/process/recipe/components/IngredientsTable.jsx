export default function IngredientsTable({ ingredients = [] }) {
  if (!ingredients.length) {
    return <div className="sidebarFieldHint">Нет ингредиентов.</div>;
  }
  return (
    <div className="sidebarPropertiesRows sidebarPropertiesRows--table">
      <div className="sidebarPropertiesTableHead" role="presentation">
        <span>Ингредиент</span>
        <span>Кол-во</span>
        <span>Ед.</span>
      </div>
      {ingredients.map((item, index) => {
        const ingredient = item?.ingredient || {};
        return (
          <div key={String(item?.id || index)} className="sidebarPropertiesTableRow">
            <span className="text-xs">{ingredient.name || item.name || "—"}</span>
            <span className="text-xs">{item.quantity ?? "—"}</span>
            <span className="text-xs">{ingredient.unit || item.unit || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}
