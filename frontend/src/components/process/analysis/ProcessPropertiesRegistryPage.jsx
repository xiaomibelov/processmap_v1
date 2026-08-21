import { useEffect, useMemo, useState } from "react";
import { apiQueryPropertyRegistry, apiExportPropertyRegistry } from "../../../lib/api.js";
import PropertyRegistryFilters from "../../../features/analytics/propertyRegistry/PropertyRegistryFilters.jsx";
import PropertyRegistryTable from "../../../features/analytics/propertyRegistry/PropertyRegistryTable.jsx";

const EMPTY_MESSAGE = "Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.";

export default function ProcessPropertiesRegistryPage({
  scope = "workspace",
  workspaceId,
  projectId,
  sessionId,
  onClose,
}) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", category: "all", source: "all", editable: "all" });
  const [sort, setSort] = useState({ key: "display_name", dir: "asc" });

  useEffect(() => {
    setLoading(true);
    apiQueryPropertyRegistry({
      category: filters.category === "all" ? "" : filters.category,
      source: filters.source === "all" ? "" : filters.source,
      editable: filters.editable,
      search: filters.search,
    }).then((res) => {
      setProperties(res.ok ? (res.rows || []) : []);
      setLoading(false);
    });
  }, [filters]);

  const sorted = useMemo(() => {
    const list = [...properties];
    list.sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sort.dir === "asc" ? -1 : 1;
      if (as > bs) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [properties, sort]);

  const handleSort = (key) => {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));
  };

  return (
    <main className="productActionsRegistryPage processPropertiesRegistryPage" data-testid="process-properties-registry-page">
      <section className="productActionsRegistryPanel productActionsRegistryPanel--page processPropertiesRegistryPanel--page">
        <header className="productActionsRegistryHeader processPropertiesRegistryHeader">
          <div className="productActionsRegistryHeaderMain">
            <div>
              <h1 className="productActionsRegistryTitle">Реестр свойств</h1>
              <p className="productActionsRegistrySubcopy">Сводный список свойств BPMN-элементов и процессных объектов.</p>
            </div>
          </div>
          {onClose ? (
            <button type="button" className="productActionsRegistryBackBtn" onClick={onClose} data-testid="process-properties-registry-back">
              Вернуться
            </button>
          ) : null}
        </header>

        <div className="productActionsRegistryContainer processPropertiesRegistryContainer">
          <div className="propertyRegistryToolbar">
            <PropertyRegistryFilters filters={filters} onChange={setFilters} />
            <div className="propertyRegistryActions">
              <button onClick={() => apiExportPropertyRegistry("csv", filters)} className="propertyRegistryBtn">CSV</button>
              <button onClick={() => apiExportPropertyRegistry("xlsx", filters)} className="propertyRegistryBtn">Excel</button>
            </div>
          </div>
          {loading ? (
            <div>Загрузка...</div>
          ) : properties.length ? (
            <PropertyRegistryTable properties={sorted} sort={sort} onSort={handleSort} />
          ) : (
            <div className="productActionsRegistryEmpty processPropertiesRegistryEmpty" data-testid="process-properties-registry-empty">
              <p>{EMPTY_MESSAGE}</p>
              <small>Workspace: {workspaceId || "—"} · Project: {projectId || "—"} · Session: {sessionId || "—"}</small>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
