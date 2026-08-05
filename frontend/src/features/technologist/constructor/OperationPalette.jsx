// T3#4 — shared-палитра операций (поиск + группировка по category).
// Заменяет два дубля: Constructor.jsx (aside) и Workspace.jsx (ws__palette).
// Заголовок панели и обёртка остаются у родителей; структурные блоки — пропсом.
import React, { useMemo, useState } from "react";
import { t } from "../i18n";
import { asArray } from "./modelUtils";
import { filterOperations, groupOperations } from "./paletteUtils";

export default function OperationPalette({ catalog, structuralBlocks = [], onAddOperation, onAddStructural }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterOperations(catalog, query), [catalog, query]);
  const groups = useMemo(() => groupOperations(filtered), [filtered]);
  const multiGroup = groups.length > 1 || (groups.length === 1 && groups[0].category !== "");

  return (
    <div className="ctor-palette-shared" data-testid="operation-palette">
      <input
        type="text"
        className="ctor-palette-search"
        data-testid="palette-search"
        placeholder={t("ctor.paletteSearch")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {asArray(catalog).length === 0 ? <div className="ctor-hint">{t("ctor.paletteEmpty")}</div> : null}
      {asArray(catalog).length > 0 && filtered.length === 0 ? (
        <div className="ctor-hint" data-testid="palette-no-results">{t("ctor.paletteNoResults")}</div>
      ) : null}
      {groups.map((group) => (
        <div className="ctor-palette-group" key={group.category || "__none__"}>
          {multiGroup ? (
            <div className="ctor-palette-group-title" data-testid={`palette-group-${group.category || "none"}`}>
              {group.category || t("ctor.paletteUncategorized")}
            </div>
          ) : null}
          {group.items.map((op) => (
            <div className="ctor-palette-item" key={String(op?.code || op?.name)}>
              <div className="ctor-palette-item-name">{String(op?.name_ru || op?.name || op?.code || "")}</div>
              <div className="ctor-palette-item-code">{String(op?.code || "")}</div>
              <button
                type="button"
                className="ctor-btn ctor-btn--small"
                data-testid={`palette-add-${String(op?.code || "")}`}
                onClick={() => onAddOperation?.(op)}
              >
                {t("ctor.addBlock")}
              </button>
            </div>
          ))}
        </div>
      ))}
      {asArray(structuralBlocks).length ? (
        <>
          <h3>{t("ctor.paletteStructural")}</h3>
          {structuralBlocks.map((spec) => (
            <button
              type="button"
              key={spec.bpmn_type}
              className="ctor-btn ctor-palette-struct"
              data-testid={`palette-${spec.bpmn_type}`}
              onClick={() => onAddStructural?.(spec)}
            >
              {spec.label}
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}
