import { useMemo, useState } from "react";
import { Badge, Pill } from "./AnalyticsDataTable.jsx";
import {
  inferPropertyValueType,
  inferPropertyFamily,
  formatPropertyValue,
  isJsonLike,
} from "./propertyValueUtils.js";
import { ru } from "../../shared/i18n/ru.js";

const t = ru.analytics;

function toText(value) {
  return String(value ?? "").trim();
}

function getRowKey(row) {
  return `${row.bpmn_id || ""}::${row.name || ""}::${row.value || ""}`;
}

const CALCULATION_PROPERTY_NAMES = new Set(["ee_time", "ingredient_value", "ingredient_um", "ee_operation"]);

function isCalculationPropertyName(name) {
  return CALCULATION_PROPERTY_NAMES.has(toText(name).toLowerCase());
}

function isPinnedPropertyName(name) {
  return isCalculationPropertyName(name);
}

function pinnedPriority(name) {
  return isPinnedPropertyName(name) ? 0 : 1;
}

function propertyTypeTone(type, valueType) {
  const t = toText(type).toLowerCase();
  const vt = toText(valueType).toLowerCase();
  if (vt === "duration") return "accent";
  if (vt === "number") return "success";
  if (vt === "json") return "purple";
  if (t.includes("reference")) return "accent";
  if (t.includes("enum")) return "purple";
  if (t.includes("camunda")) return "default";
  return "default";
}

function categoryTone(category) {
  const c = toText(category).toLowerCase();
  if (c.includes("extension")) return "purple";
  if (c.includes("timing")) return "warning";
  if (c.includes("material")) return "success";
  if (c.includes("equipment")) return "accent";
  return "muted";
}

function familyTone(family) {
  const f = toText(family).toLowerCase();
  if (f === "ingredient") return "success";
  if (f === "equipment") return "accent";
  if (f === "duration") return "warning";
  if (f === "container") return "purple";
  if (f === "structured") return "default";
  return "muted";
}

function UsageBar({ count, max }) {
  const pct = max > 0 ? Math.round((Number(count) || 0) / max * 100) : 0;
  return (
    <div className="analyticsUsageBar" title={`${count} использований`}>
      <div className="analyticsUsageBarTrack">
        <div className="analyticsUsageBarFill" style={{ width: `${pct}%` }} />
      </div>
      <span className="analyticsUsageBarValue">{Number(count) || 0}</span>
    </div>
  );
}

function sessionCountLabel(n) {
  return String(Number(n) || 0);
}

function SessionCountBadge({ count }) {
  const c = Number(count) || 0;
  const multi = c > 1;
  return (
    <span
      className={`analyticsSessionBadge ${multi ? "analyticsSessionBadge--multi" : "analyticsSessionBadge--single"}`}
      title={t.usedInSessionsTitle.replace("{{count}}", c)}
    >
      {sessionCountLabel(c)}
    </span>
  );
}

function JsonModal({ value, onClose }) {
  if (!value) return null;
  let pretty = value;
  try {
    pretty = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    /* keep raw */
  }
  return (
    <div className="analyticsJsonModalOverlay" onClick={onClose}>
      <div className="analyticsJsonModal" onClick={(e) => e.stopPropagation()}>
        <div className="analyticsJsonModalHeader">
          <h4>{t.jsonValueTitle}</h4>
          <button type="button" className="analyticsJsonModalClose" onClick={onClose}>×</button>
        </div>
        <pre className="analyticsJsonModalBody">{pretty}</pre>
      </div>
    </div>
  );
}

function ValueCell({ row }) {
  const [expanded, setExpanded] = useState(false);
  const valueType = inferPropertyValueType(row.name, row.value);
  const formatted = formatPropertyValue(row.value, valueType);
  const json = valueType === "json" || isJsonLike(row.value);

  if (json) {
    return (
      <>
        <button
          type="button"
          className="analyticsValueJsonTrigger"
          onClick={() => setExpanded(true)}
          title={t.expandJsonTitle}
        >
          <Badge tone="purple">JSON</Badge>
          <span className="analyticsValueJsonPreview">{formatted}</span>
        </button>
        {expanded ? <JsonModal value={toText(row.value)} onClose={() => setExpanded(false)} /> : null}
      </>
    );
  }

  if (valueType === "duration") {
    return <Pill>{formatted}</Pill>;
  }

  if (valueType === "number") {
    return <Badge tone="success">{formatted}</Badge>;
  }

  if (toText(row.value).toLowerCase() === "из задания") {
    return <em className="analyticsValueFromTask">{formatted}</em>;
  }

  return (
    <span className="analyticsValueText" title={toText(row.value)}>
      {formatted}
    </span>
  );
}

const COLUMNS = [
  { key: "select", label: "", width: "44px" },
  { key: "bpmn_name", label: "BPMN Name", flex: "minmax(200px, 2fr)" },
  { key: "name", label: t.columnProperty, flex: "minmax(200px, 2fr)" },
  { key: "type", label: t.columnPropertyType, flex: "minmax(120px, 1fr)" },
  { key: "category", label: t.columnPropertyCategory, flex: "minmax(150px, 1.2fr)" },
  { key: "source", label: t.columnPropertySource, flex: "minmax(180px, 1.5fr)" },
  { key: "usage_count", label: t.columnUsageCount, flex: "minmax(130px, 1fr)" },
  { key: "session_count", label: t.columnSessionCount, flex: "minmax(110px, 1fr)" },
  { key: "value", label: t.columnPropertyValue, flex: "minmax(200px, 1.5fr)" },
];

const GRID_TEMPLATE = COLUMNS.map((c) => c.width || c.flex).join(" ");

function HeaderCell({ col, sort, onSort }) {
  const sortable = ["bpmn_name", "name", "usage_count", "session_count"].includes(col.key);
  const active = sort?.key === col.key;
  return (
    <div
      className={`analyticsPropTableHeadCell analyticsPropTableHeadCell--${col.key} ${sortable ? "analyticsPropTableHeadCell--sortable" : ""} ${active ? "analyticsPropTableHeadCell--active" : ""}`}
      onClick={() => sortable && onSort?.(col.key)}
      title={col.label}
    >
      <span className="analyticsPropTableHeadCellLabel">{col.label}</span>
      {active ? <span className="analyticsSortIndicator">{sort.dir === "asc" ? " ↑" : " ↓"}</span> : null}
    </div>
  );
}

function Row({ row, index, selectedRows, onToggleRow, maxUsage }) {
  const key = getRowKey(row);
  const valueType = inferPropertyValueType(row.name, row.value);
  const family = inferPropertyFamily(row.name, valueType);
  const pinned = isPinnedPropertyName(row.name);
  const calc = isCalculationPropertyName(row.name);

  return (
    <div
      className={`analyticsPropTableRow ${selectedRows.has(key) ? "analyticsPropTableRow--selected" : ""} ${pinned ? "analyticsPropTableRow--pinned" : ""}`}
      style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}
      data-testid={`property-row-${index}`}
    >
      <div className="analyticsPropTableCell analyticsPropTableCell--select">
        <input
          type="checkbox"
          checked={selectedRows.has(key)}
          onChange={() => onToggleRow(key, row)}
          aria-label={t.selectRowAria.replace("{{name}}", row.name || "—")}
        />
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--bpmnName" title={toText(row.bpmn_name)}>
        <span className="analyticsPropBpmnName">{toText(row.bpmn_name) || "—"}</span>
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--name" title={toText(row.name)}>
        <span className={`analyticsPropName ${calc ? "analyticsPropName--calc" : ""}`}>
          {toText(row.name) || "—"}
          {calc ? (
            <span className="analyticsPinnedIndicator" title={t.calcPropertyTooltip}> ★</span>
          ) : null}
        </span>
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--type" title={toText(row.type)}>
        <Badge tone={propertyTypeTone(row.type, valueType)}>{toText(row.type) || valueType}</Badge>
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--category" title={toText(row.category)}>
        <Badge tone={categoryTone(row.category)}>{toText(row.category) || family}</Badge>
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--source" title={toText(row.source)}>
        {toText(row.source) || "—"}
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--usage">
        <UsageBar count={row.usage_count || 0} max={maxUsage} />
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--sessions">
        <SessionCountBadge count={row.session_count || 0} />
      </div>
      <div className="analyticsPropTableCell analyticsPropTableCell--value" title={toText(row.value)}>
        <ValueCell row={row} />
      </div>
    </div>
  );
}

export function usePropertyRowsProcessor(rows, { search, sort, valueTypeFilter, usageRange, familyFilter, nameFilter }) {
  return useMemo(() => {
    let result = [...rows];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        [r.bpmn_name, r.name, r.value, r.category, r.source, r.type].some((field) =>
          toText(field).toLowerCase().includes(q)
        )
      );
    }

    if (nameFilter?.length) {
      result = result.filter((r) => nameFilter.includes(toText(r.name)));
    }

    if (familyFilter?.length) {
      result = result.filter((r) => {
        const vt = inferPropertyValueType(r.name, r.value);
        const family = inferPropertyFamily(r.name, vt);
        return familyFilter.includes(family);
      });
    }

    if (valueTypeFilter?.length) {
      result = result.filter((r) => valueTypeFilter.includes(inferPropertyValueType(r.name, r.value)));
    }

    if (usageRange) {
      const [min, max] = usageRange;
      result = result.filter((r) => {
        const c = Number(r.usage_count) || 0;
        return c >= min && c <= max;
      });
    }

    if (sort?.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      result.sort((a, b) => {
        if (sort.key === "usage_count") {
          return dir * ((Number(a.usage_count) || 0) - (Number(b.usage_count) || 0));
        }
        if (sort.key === "session_count") {
          return dir * ((Number(a.session_count) || 0) - (Number(b.session_count) || 0));
        }
        if (sort.key === "name") {
          return dir * toText(a.name).localeCompare(toText(b.name), "ru-RU");
        }
        if (sort.key === "bpmn_name") {
          return dir * toText(a.bpmn_name).localeCompare(toText(b.bpmn_name), "ru-RU");
        }
        return 0;
      });
    }

    return result;
  }, [rows, search, sort, valueTypeFilter, usageRange, familyFilter, nameFilter]);
}

export default function AnalyticsPropertiesTable({
  rows = [],
  selectedRows,
  onToggleRow,
  onSelectAllVisible,
  sort,
  onSort,
}) {
  const maxUsage = useMemo(() => Math.max(...rows.map((r) => Number(r.usage_count) || 0), 1), [rows]);

  return (
    <div className="analyticsPropTableWrap">
      <div className="analyticsPropTableHead" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
        <div className="analyticsPropTableHeadCell analyticsPropTableHeadCell--select">
          <input
            type="checkbox"
            checked={rows.length > 0 && rows.every((r) => selectedRows.has(getRowKey(r)))}
            onChange={(e) => onSelectAllVisible?.(e.target.checked, rows)}
            aria-label={t.selectAllVisibleAria}
          />
        </div>
        {COLUMNS.slice(1).map((col) => (
          <HeaderCell key={col.key} col={col} sort={sort} onSort={onSort} />
        ))}
      </div>
      <div className="analyticsPropTableBody">
        {rows.length === 0 ? (
          <div className="analyticsPropTableEmpty">{t.noPropertiesByFilter}</div>
        ) : (
          rows.map((row, idx) => (
            <Row
              key={getRowKey(row) + idx}
              row={row}
              index={idx}
              selectedRows={selectedRows}
              onToggleRow={onToggleRow}
              maxUsage={maxUsage}
            />
          ))
        )}
      </div>
    </div>
  );
}

export { getRowKey };
