import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  apiExportAnalyticsPropertiesCsv,
  apiExportAnalyticsPropertiesXlsx,
  apiGetAnalyticsProperties,
} from "../../lib/api.js";
import { DownloadIcon, FilterIcon, SearchIcon } from "./AnalyticsIcons.jsx";
import AnalyticsPropertiesTable, {
  getRowKey,
  usePropertyRowsProcessor,
} from "./AnalyticsPropertiesTable.jsx";
import { AnalyticsError, AnalyticsLoading } from "./AnalyticsStatus.jsx";
import EmptyState from "./registry/EmptyState.jsx";
import { inferPropertyValueType } from "./propertyValueUtils.js";

function text(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = text(value).replace(/"/g, '""');
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s}"`;
  return s;
}

function exportRowsToCsv(rows, filename = "properties.csv") {
  const header = ["name", "type", "category", "source", "usage_count", "value", "value_type"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const vt = inferPropertyValueType(r.name, r.value);
    lines.push(
      [
        csvEscape(r.name),
        csvEscape(r.type),
        csvEscape(r.category),
        csvEscape(r.source),
        csvEscape(r.usage_count),
        csvEscape(r.value),
        csvEscape(vt),
      ].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

const QUICK_FILTERS = [
  { key: "ingredient", label: "Ингредиенты" },
  { key: "equipment", label: "Оборудование" },
  { key: "duration", label: "Длительность" },
  { key: "json", label: "С JSON" },
  { key: "unused", label: "Не используется" },
];

function MultiSelect({ label, options = [], selected = [], onChange }) {
  const values = toArray(options);
  return (
    <div className="analyticsFilterField">
      <label className="analyticsFilterFieldLabel">{label}</label>
      <div className="analyticsFilterFieldOptions">
        {values.length === 0 ? <span className="analyticsFilterEmptyOptions">Нет значений</span> : null}
        {values.map((opt) => {
          const v = String(opt);
          const checked = selected.includes(v);
          return (
            <label key={v} className="analyticsFilterOption">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  if (checked) onChange(selected.filter((s) => s !== v));
                  else onChange([...selected, v]);
                }}
              />
              <span>{v}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CompareDrawer({ rows, onClose }) {
  if (!rows.length) return null;
  return (
    <div className="analyticsDrawerOverlay" onClick={onClose}>
      <div className="analyticsDrawer analyticsDrawer--compare" onClick={(e) => e.stopPropagation()}>
        <div className="analyticsDrawerHeader">
          <h3>Сравнение свойств ({rows.length})</h3>
          <button type="button" className="analyticsDrawerClose" onClick={onClose}>×</button>
        </div>
        <div className="analyticsDrawerBody">
          <div className="analyticsCompareGrid" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(200px, 1fr))` }}>
            {rows.map((r, idx) => (
              <div key={idx} className="analyticsCompareColumn">
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">Название</span>
                  <span className="analyticsCompareValue">{text(r.name) || "—"}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">Тип</span>
                  <span className="analyticsCompareValue">{text(r.type) || inferPropertyValueType(r.name, r.value)}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">Категория</span>
                  <span className="analyticsCompareValue">{text(r.category) || "—"}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">Источник</span>
                  <span className="analyticsCompareValue">{text(r.source) || "—"}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">Использований</span>
                  <span className="analyticsCompareValue">{Number(r.usage_count) || 0}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">Значение</span>
                  <span className="analyticsCompareValue analyticsCompareValue--break">{text(r.value) || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPropertiesPanel({ scope, scopeId }) {
  const [rawRows, setRawRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState({});
  const abortRef = useRef(null);

  const [backendFilters, setBackendFilters] = useState({});
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [quickFilters, setQuickFilters] = useState([]);
  const [valueTypeFilter, setValueTypeFilter] = useState([]);
  const [usageRange, setUsageRange] = useState([0, Infinity]);
  const [sort, setSort] = useState({ key: "usage_count", dir: "desc" });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [selectedRows, setSelectedRows] = useState(new Set());
  const [compareRows, setCompareRows] = useState([]);

  useEffect(() => {
    setSelectedRows(new Set());
  }, [scope, scopeId, backendFilters, debouncedSearch, quickFilters, valueTypeFilter, usageRange]);

  const loadData = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    const params = { page: 1, limit: 500 };
    if (backendFilters.type?.length) params.type_filter = backendFilters.type;
    if (backendFilters.category?.length) params.category_filter = backendFilters.category;
    if (backendFilters.source?.length) params.source_filter = backendFilters.source;
    try {
      const result = await apiGetAnalyticsProperties(scope, scopeId, params, { signal });
      if (signal?.aborted) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || "Не удалось загрузить реестр свойств.");
        return;
      }
      setRawRows(result.rows);
      setTotal(result.total);
      setOptions(result.filter_options || {});
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || "Ошибка загрузки"));
    }
  }, [scope, scopeId, backendFilters]);

  useEffect(() => {
    const controller = new AbortController();
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    abortRef.current = controller;
    loadData({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [loadData]);

  const filteredRows = usePropertyRowsProcessor(rawRows, {
    search: debouncedSearch,
    sort,
    valueTypeFilter,
    usageRange,
    quickFilters,
  });

  const valueTypeOptions = useMemo(() => {
    const set = new Set();
    for (const r of rawRows) set.add(inferPropertyValueType(r.name, r.value));
    return Array.from(set).sort();
  }, [rawRows]);

  const maxUsage = useMemo(() => Math.max(...rawRows.map((r) => Number(r.usage_count) || 0), 1), [rawRows]);

  const toggleQuick = useCallback((key) => {
    setQuickFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const toggleRow = useCallback((key, row) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((checked, visibleRows) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      for (const r of visibleRows) {
        const key = getRowKey(r);
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const selectedRowObjects = useMemo(
    () => filteredRows.filter((r) => selectedRows.has(getRowKey(r))),
    [filteredRows, selectedRows]
  );

  async function handleServerExportCsv() {
    if (exporting) return;
    setExporting(true);
    const result = await apiExportAnalyticsPropertiesCsv(scope, scopeId);
    if (result?.ok && result.blob) {
      downloadBlob(result.blob, result.filename || `properties-${scope}-${scopeId}.csv`);
    }
    setExporting(false);
  }

  async function handleServerExportXlsx() {
    if (exporting) return;
    setExporting(true);
    const result = await apiExportAnalyticsPropertiesXlsx(scope, scopeId);
    if (result?.ok && result.blob) {
      downloadBlob(result.blob, result.filename || `properties-${scope}-${scopeId}.xlsx`);
    }
    setExporting(false);
  }

  function handleSelectedExport() {
    exportRowsToCsv(selectedRowObjects, `properties-selected-${scope}-${scopeId}.csv`);
  }

  function handleCompare() {
    if (selectedRowObjects.length >= 2 && selectedRowObjects.length <= 3) {
      setCompareRows(selectedRowObjects);
    }
  }

  function toggleSort(key) {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));
  }

  return (
    <div className="analyticsPanel">
      <div className="analyticsPanelToolbar analyticsPanelToolbar--stacked">
        <div className="analyticsToolbarRow">
          <div className="analyticsSearchWrap">
            <SearchIcon className="analyticsSearchIcon" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, значению, категории..."
              className="analyticsSearchInput"
            />
          </div>
          <div className="analyticsQuickFilters">
            {QUICK_FILTERS.map((f) => {
              const active = quickFilters.includes(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  className={`analyticsQuickFilter ${active ? "analyticsQuickFilter--active" : ""}`}
                  onClick={() => toggleQuick(f.key)}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={`analyticsFilterToggle ${drawerOpen ? "analyticsFilterToggle--active" : ""}`}
            onClick={() => setDrawerOpen((v) => !v)}
            title="Расширенные фильтры"
          >
            <FilterIcon className="w-4 h-4" />
            Фильтры
          </button>
        </div>
        {drawerOpen ? (
          <div className="analyticsAdvancedFilters">
            <MultiSelect
              label="Тип"
              options={options.type}
              selected={backendFilters.type || []}
              onChange={(v) => setBackendFilters((prev) => ({ ...prev, type: v }))}
            />
            <MultiSelect
              label="Категория"
              options={options.category}
              selected={backendFilters.category || []}
              onChange={(v) => setBackendFilters((prev) => ({ ...prev, category: v }))}
            />
            <MultiSelect
              label="Источник"
              options={options.source}
              selected={backendFilters.source || []}
              onChange={(v) => setBackendFilters((prev) => ({ ...prev, source: v }))}
            />
            <MultiSelect
              label="Тип значения"
              options={valueTypeOptions}
              selected={valueTypeFilter}
              onChange={setValueTypeFilter}
            />
            <div className="analyticsFilterField">
              <label className="analyticsFilterFieldLabel">Использований (макс {maxUsage})</label>
              <div className="analyticsUsageRange">
                <input
                  type="number"
                  min={0}
                  max={maxUsage}
                  value={usageRange[0]}
                  onChange={(e) => setUsageRange([Number(e.target.value) || 0, usageRange[1]])}
                  className="analyticsUsageRangeInput"
                />
                <span>—</span>
                <input
                  type="number"
                  min={0}
                  max={maxUsage}
                  value={usageRange[1] === Infinity ? "" : usageRange[1]}
                  onChange={(e) => setUsageRange([usageRange[0], e.target.value === "" ? Infinity : Number(e.target.value)])}
                  className="analyticsUsageRangeInput"
                />
              </div>
            </div>
            <div className="analyticsFilterActions">
              <button
                type="button"
                className="analyticsFilterClear"
                onClick={() => {
                  setBackendFilters({});
                  setValueTypeFilter([]);
                  setUsageRange([0, Infinity]);
                  setSearch("");
                  setQuickFilters([]);
                }}
              >
                Сбросить все
              </button>
            </div>
          </div>
        ) : null}
        <div className="analyticsBulkBar">
          <span className="analyticsBulkInfo">
            {selectedRows.size} выбрано · {filteredRows.length} из {total}
          </span>
          <div className="analyticsBulkButtons">
            <button type="button" className="analyticsExportBtn" disabled={selectedRows.size === 0} onClick={handleSelectedExport}>
              <DownloadIcon className="w-4 h-4" />
              CSV выбранных
            </button>
            <button
              type="button"
              className="analyticsCompareBtn"
              disabled={selectedRows.size < 2 || selectedRows.size > 3}
              onClick={handleCompare}
            >
              Сравнить
            </button>
            <button type="button" className="analyticsExportBtn" onClick={handleServerExportCsv} disabled={exporting}>
              {exporting ? "Экспорт…" : "CSV всех"}
            </button>
            <button type="button" className="analyticsExportBtn" onClick={handleServerExportXlsx} disabled={exporting}>
              {exporting ? "Экспорт…" : "Excel всех"}
            </button>
          </div>
        </div>
      </div>

      {loading && !rawRows.length ? <AnalyticsLoading text="Загрузка реестра свойств…" /> : null}
      {error ? <AnalyticsError message={error} onRetry={() => loadData()} /> : null}
      {!loading && !error && !rawRows.length ? (
        <EmptyState title="Нет свойств" description="Для выбранного scope не найдено свойств." />
      ) : null}
      {rawRows.length > 0 ? (
        <AnalyticsPropertiesTable
          rows={filteredRows}
          selectedRows={selectedRows}
          onToggleRow={toggleRow}
          onSelectAllVisible={selectAllVisible}
          sort={sort}
          onSort={toggleSort}
        />
      ) : null}
      {compareRows.length ? <CompareDrawer rows={compareRows} onClose={() => setCompareRows([])} /> : null}
    </div>
  );
}
