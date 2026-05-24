function toText(value) {
  return String(value || "").trim();
}

function StatusBadge({ status }) {
  const text = toText(status);
  if (!text) return <span className="registryStatusBadge">—</span>;
  const isComplete = text.toLowerCase() === "полная" || text.toLowerCase() === "complete";
  const isPartial = text.toLowerCase() === "неполная" || text.toLowerCase() === "incomplete";
  const colorVar = isComplete
    ? "var(--registry-green-complete)"
    : isPartial
      ? "var(--registry-orange-partial)"
      : "var(--registry-text-muted)";
  return (
    <span className="registryStatusBadge" style={{ color: colorVar }} data-testid="registry-status-badge">
      {(isComplete || isPartial) ? (
        <span className="registryStatusDot" style={{ background: colorVar }} aria-hidden="true" />
      ) : null}
      {text}
    </span>
  );
}

export default function DataTable({ items = [], columns = [] }) {
  if (!items.length) return null;

  const defaultColumns = [
    { key: "action_name", label: "Действие", width: "flex-grow:2", align: "left" },
    { key: "product_name", label: "Продукт", width: "flex-grow:1", align: "left" },
    { key: "session_id", label: "Сессия", width: "120px", align: "left" },
    { key: "source", label: "Источник", width: "140px", align: "left" },
    { key: "status", label: "Статус", width: "120px", align: "center" },
    { key: "date", label: "Дата", width: "100px", align: "right" },
  ];

  const cols = columns.length ? columns : defaultColumns;

  return (
    <div className="registryDataTable" role="table" data-testid="registry-data-table">
      <div className="registryDataTableHead" role="row">
        {cols.map((c) => (
          <span
            key={c.key}
            role="columnheader"
            className={`registryDataTableHeadCell registryDataTableCell--${c.align || "left"}`}
            style={{ flex: c.width || "1" }}
          >
            {c.label}
          </span>
        ))}
      </div>
      {items.map((item, idx) => (
        <div className="registryDataTableRow" role="row" key={item.id || idx}>
          {cols.map((c) => {
            const raw = item[c.key];
            const value = raw == null ? "—" : toText(raw);
            const isStatus = c.key === "status";
            const isDate = c.key === "date";
            return (
              <span
                key={c.key}
                role="cell"
                className={`registryDataTableCell registryDataTableCell--${c.align || "left"} ${isDate ? "registryDataTableCell--date" : ""}`}
                style={{ flex: c.width || "1" }}
                data-testid={`registry-cell-${c.key}`}
              >
                {isStatus ? <StatusBadge status={value} /> : value}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
