import { useMemo, useState } from "react";

const TYPE_PILLS = [
  { key: "all", label: "Все" },
  { key: "camunda", label: "Camunda" },
  { key: "zeebe", label: "Zeebe" },
  { key: "custom", label: "Пользовательские" },
];

export default function PropertiesRegistry({
  workspaceId = "",
  projectId = "",
  sessionId = "",
  onClose = null,
}) {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState("all");

  const scopeLabel = sessionId
    ? "сессия"
    : projectId
      ? "проект"
      : workspaceId
        ? "workspace"
        : "весь workspace";

  const rows = useMemo(() => {
    // Placeholder: will be wired to real API in follow-up contour
    return [];
  }, [workspaceId, projectId, sessionId, query, activeType]);

  return (
    <main className="propertiesRegistryPage" data-testid="properties-registry-page">
      <section className="propertiesRegistrySurface">
        <header className="propertiesRegistryHeader">
          <div>
            <h1>Реестр свойств</h1>
            <p>Scope: {scopeLabel}</p>
          </div>
          {onClose ? (
            <button type="button" className="secondaryBtn smallBtn" onClick={onClose} data-testid="properties-registry-close">
              Вернуться
            </button>
          ) : null}
        </header>

        <div className="propertiesRegistryToolbar">
          <input
            type="text"
            className="input"
            placeholder="Поиск по названию или ключу…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="properties-registry-search"
          />
          <div className="propertiesRegistryTypePills" role="tablist" aria-label="Фильтр по типу">
            {TYPE_PILLS.map((pill) => (
              <button
                key={pill.key}
                type="button"
                role="tab"
                aria-selected={activeType === pill.key}
                className={activeType === pill.key ? "primaryBtn smallBtn" : "secondaryBtn smallBtn"}
                onClick={() => setActiveType(pill.key)}
                data-testid={`properties-registry-type-${pill.key}`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="propertiesRegistryEmpty" data-testid="properties-registry-empty">
            <p>Реестр свойств пока пуст.</p>
            <small>Свойства BPMN-элементов будут собраны при следующем сохранении диаграммы.</small>
          </div>
        ) : (
          <ul className="propertiesRegistryList">
            {rows.map((row, index) => (
              <li key={row.id || index} className="propertiesRegistryItem">
                {row.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
