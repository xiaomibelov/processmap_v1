function toText(value) {
  return String(value ?? "").trim();
}

function isJsonLike(value) {
  const s = toText(value);
  if (!s) return false;
  return (s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"));
}

function truncate(value, max = 60) {
  const s = toText(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function Badge({ children, tone = "default" }) {
  const toneClass = ` analyticsBadge--${tone}`;
  return <span className={`analyticsBadge${toneClass}`}>{children}</span>;
}

export function Pill({ children }) {
  return <span className="analyticsPill">{children}</span>;
}

export default function AnalyticsDataTable({ columns = [], rows = [], emptyState = null }) {
  if (!rows.length) {
    return emptyState || <div className="text-sm text-muted">Нет данных.</div>;
  }

  return (
    <div className="analyticsDataTableWrap">
      <table className="analyticsDataTable">
        <thead className="analyticsDataTableHead">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`analyticsDataTableHeadCell analyticsDataTableHeadCell--${col.align || "left"}`}
                style={{ width: col.width, minWidth: col.minWidth }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || row.registry_id || row.bpmn_id || idx} className="analyticsDataTableRow">
              {columns.map((col) => {
                const raw = row[col.key];
                const render = col.render;
                if (render) {
                  return (
                    <td
                      key={col.key}
                      className={`analyticsDataTableCell analyticsDataTableCell--${col.align || "left"}`}
                      style={{ width: col.width, minWidth: col.minWidth }}
                    >
                      {render(raw, row)}
                    </td>
                  );
                }
                const value = raw == null ? "—" : toText(raw);
                const jsonLike = isJsonLike(value);
                return (
                  <td
                    key={col.key}
                    className={`analyticsDataTableCell analyticsDataTableCell--${col.align || "left"}`}
                    style={{ width: col.width, minWidth: col.minWidth }}
                    title={jsonLike ? value : undefined}
                  >
                    {jsonLike ? truncate(value, 80) : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
