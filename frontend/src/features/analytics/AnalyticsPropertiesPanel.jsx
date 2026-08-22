import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  apiExportAdvancedCalculationXlsx,
  apiExportAnalyticsPropertiesCsv,
  apiExportAnalyticsPropertiesRecalculatedXlsx,
  apiExportAnalyticsPropertiesXlsx,
  apiGetAnalyticsProperties,
  apiGetAnalyticsPropertiesRecalculation,
} from "../../lib/api.js";
import { CalculatorIcon, DownloadIcon, FilterIcon, SearchIcon } from "./AnalyticsIcons.jsx";
import AnalyticsPropertiesTable, {
  getRowKey,
  usePropertyRowsProcessor,
} from "./AnalyticsPropertiesTable.jsx";
import { AnalyticsError, AnalyticsLoading } from "./AnalyticsStatus.jsx";
import EmptyState from "./registry/EmptyState.jsx";
import { inferPropertyValueType, inferPropertyFamily } from "./propertyValueUtils.js";
import Modal from "../../shared/ui/Modal.jsx";
import { ru } from "../../shared/i18n/ru.js";

const t = ru.analytics;

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

function Paginator({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="analyticsPaginator">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="analyticsPaginatorBtn"
      >
        ←
      </button>
      <span className="analyticsPaginatorText">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="analyticsPaginatorBtn"
      >
        →
      </button>
    </div>
  );
}

function MultiSelect({ label, options = [], selected = [], onChange }) {
  const values = toArray(options);
  return (
    <div className="analyticsFilterField">
      <label className="analyticsFilterFieldLabel">{label}</label>
      <div className="analyticsFilterFieldOptions analyticsFilterFieldOptions--compact">
        {values.length === 0 ? <span className="analyticsFilterEmptyOptions">{t.filterEmptyOptions}</span> : null}
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
          <h3>{t.compareTitle.replace("{{count}}", rows.length)}</h3>
          <button type="button" className="analyticsDrawerClose" onClick={onClose}>×</button>
        </div>
        <div className="analyticsDrawerBody">
          <div className="analyticsCompareGrid" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(200px, 1fr))` }}>
            {rows.map((r, idx) => (
              <div key={idx} className="analyticsCompareColumn">
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">{t.compareName}</span>
                  <span className="analyticsCompareValue">{text(r.name) || "—"}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">{t.compareType}</span>
                  <span className="analyticsCompareValue">{text(r.type) || inferPropertyValueType(r.name, r.value)}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">{t.compareCategory}</span>
                  <span className="analyticsCompareValue">{text(r.category) || "—"}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">{t.compareSource}</span>
                  <span className="analyticsCompareValue">{text(r.source) || "—"}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">{t.compareUsage}</span>
                  <span className="analyticsCompareValue">{Number(r.usage_count) || 0}</span>
                </div>
                <div className="analyticsCompareCell">
                  <span className="analyticsCompareLabel">{t.compareValue}</span>
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

export default function AnalyticsPropertiesPanel({ scope, scopeId, gaps = [] }) {
  const [rawRows, setRawRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState({});
  const abortRef = useRef(null);

  const [recalcOpen, setRecalcOpen] = useState(false);
  const [recalcRows, setRecalcRows] = useState([]);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcError, setRecalcError] = useState("");
  const recalcAbortRef = useRef(null);

  const [sourceValidationModal, setSourceValidationModal] = useState({
    open: false,
    message: "",
    tasks: [],
  });

  const [backendFilters, setBackendFilters] = useState({});
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [valueTypeFilter, setValueTypeFilter] = useState([]);
  const [familyFilter, setFamilyFilter] = useState([]);
  const [usageRange, setUsageRange] = useState([0, Infinity]);
  const [sort, setSort] = useState({ key: "bpmn_name", dir: "asc" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const PAGE_SIZES = [20, 50, 100];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  const [nameFilter, setNameFilter] = useState([]);

  const [selectedRows, setSelectedRows] = useState(new Set());
  const [compareRows, setCompareRows] = useState([]);

  useEffect(() => {
    setSelectedRows(new Set());
    setPage(1);
  }, [scope, scopeId, backendFilters, debouncedSearch, valueTypeFilter, familyFilter, nameFilter, usageRange, pageSize]);

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
        setError(text(result?.error) || t.errorLoadingProperties);
        return;
      }
      setRawRows(result.rows);
      setTotal(result.total);
      setOptions(result.filter_options || {});
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || t.errorGeneric));
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

  // Reset the "Расчёт" section when the scope changes and abort any in-flight fetch.
  useEffect(() => {
    setRecalcOpen(false);
    setRecalcRows([]);
    setRecalcError("");
    setRecalcLoading(false);
    if (recalcAbortRef.current) {
      try { recalcAbortRef.current.abort(); } catch {}
      recalcAbortRef.current = null;
    }
  }, [scope, scopeId]);

  // Drill-down from AnalyticsOverviewPanel: ?source=...&property=...
  const [drillDownApplied, setDrillDownApplied] = useState(false);
  useEffect(() => {
    if (drillDownApplied) return;
    const params = new URLSearchParams(window.location.search);
    const sourceParam = params.get("source");
    const propertyParam = params.get("property");
    if (!sourceParam && !propertyParam) {
      setDrillDownApplied(true);
      return;
    }
    setBackendFilters((prev) => ({
      ...prev,
      ...(sourceParam ? { source: [sourceParam] } : {}),
    }));
    if (propertyParam) setNameFilter([propertyParam]);
    setDrillDownApplied(true);
  }, [drillDownApplied]);

  const filteredRows = usePropertyRowsProcessor(rawRows, {
    search: debouncedSearch,
    sort,
    valueTypeFilter,
    usageRange,
    familyFilter,
    nameFilter,
  });

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const valueTypeOptions = useMemo(() => {
    const set = new Set();
    for (const r of rawRows) set.add(inferPropertyValueType(r.name, r.value));
    return Array.from(set).sort();
  }, [rawRows]);

  const familyOptions = useMemo(() => {
    const set = new Set();
    for (const r of rawRows) {
      const vt = inferPropertyValueType(r.name, r.value);
      set.add(inferPropertyFamily(r.name, vt));
    }
    return Array.from(set).sort();
  }, [rawRows]);

  const maxUsage = useMemo(() => Math.max(...rawRows.map((r) => Number(r.usage_count) || 0), 1), [rawRows]);

  const propertyNameOptions = useMemo(() => {
    const counts = new Map();
    for (const r of rawRows) {
      const name = text(r.name);
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const calcNames = ["ee_time", "ingredient_value", "ingredient_um", "ee_operation"];
    const entries = Array.from(counts.entries());
    entries.sort((a, b) => {
      const aCalc = calcNames.includes(a[0].toLowerCase()) ? 0 : 1;
      const bCalc = calcNames.includes(b[0].toLowerCase()) ? 0 : 1;
      if (aCalc !== bCalc) return aCalc - bCalc;
      return b[1] - a[1];
    });
    return entries.map(([name, count]) => ({ name, count }));
  }, [rawRows]);

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

  async function handleConfirmExportRecalculatedXlsx() {
    if (exporting) return;
    setExporting(true);
    setSourceValidationModal((m) => ({ ...m, open: false }));
    const result = await apiExportAnalyticsPropertiesRecalculatedXlsx(scope, scopeId, { mode: "source" });
    setExporting(false);
    if (!result?.ok) {
      setError(text(result?.error) || t.errorLoadingRecalcShort);
      return;
    }
    if (result.blob) {
      downloadBlob(result.blob, result.filename || `properties-recalculated-${scope}-${scopeId}.xlsx`);
    }
  }

  function handleRequestExportRecalculatedXlsx() {
    if (exporting) return;
    const invalidGaps = gaps.filter((r) => r.source === "нет данных");
    if (invalidGaps.length > 0) {
      setSourceValidationModal({
        open: true,
        message: t.gapsDescription,
        tasks: invalidGaps,
      });
      return;
    }
    handleConfirmExportRecalculatedXlsx();
  }

  async function handleServerExportAdvancedCalculationXlsx() {
    if (exporting) return;
    if (scope !== "session") {
      setError(t.errorAdvancedCalcSessionOnly);
      return;
    }
    setExporting(true);
    setError("");
    const result = await apiExportAdvancedCalculationXlsx(scope, scopeId);
    if (!result?.ok) {
      let message = text(result?.error) || t.errorAdvancedCalc;
      if (result?.status === 404) message = t.sessionNotFound;
      else if (result?.status === 422) message = t.bpmnParseError + message;
      setError(message);
      setExporting(false);
      return;
    }
    if (result.blob) {
      downloadBlob(result.blob, result.filename || `advanced-calculation-${scope}-${scopeId}.xlsx`);
    }
    setExporting(false);
  }

  function handleSelectedExport() {
    exportRowsToCsv(selectedRowObjects, `properties-selected-${scope}-${scopeId}.csv`);
  }

  const loadRecalculation = useCallback(async ({ signal } = {}) => {
    setRecalcLoading(true);
    setRecalcError("");
    try {
      const result = await apiGetAnalyticsPropertiesRecalculation(scope, scopeId, { signal });
      if (signal?.aborted) return;
      setRecalcLoading(false);
      if (!result?.ok) {
        setRecalcError(text(result?.error) || t.errorLoadingRecalcShort);
        return;
      }
      setRecalcRows(result.rows || []);
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setRecalcLoading(false);
      setRecalcError(String(e?.message || e || t.errorLoadingRecalcShort));
    }
  }, [scope, scopeId]);

  function handleToggleRecalc() {
    const next = !recalcOpen;
    setRecalcOpen(next);
    // Lazy-load on first open (and retry on reopen after an error / empty).
    if (next && recalcRows.length === 0 && !recalcLoading) {
      const controller = new AbortController();
      if (recalcAbortRef.current) {
        try { recalcAbortRef.current.abort(); } catch {}
      }
      recalcAbortRef.current = controller;
      loadRecalculation({ signal: controller.signal });
    }
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
              placeholder={t.searchPropertiesPlaceholder}
              className="analyticsSearchInput"
            />
          </div>
          <div className="analyticsPageSize">
            <label>{t.pageSizeLabel}</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={`analyticsFilterToggle ${drawerOpen ? "analyticsFilterToggle--active" : ""}`}
            onClick={() => setDrawerOpen((v) => !v)}
            title={t.advancedFiltersTitle}
          >
            <FilterIcon className="w-4 h-4" />
            {t.filtersToggle}
          </button>
        </div>
        {drawerOpen ? (
          <div className="analyticsAdvancedFilters analyticsAdvancedFilters--compact">
            <div className="analyticsAdvancedFiltersGrid">
              <MultiSelect
                label={t.filterType}
                options={options.type}
                selected={backendFilters.type || []}
                onChange={(v) => setBackendFilters((prev) => ({ ...prev, type: v }))}
              />
              <MultiSelect
                label={t.filterCategory}
                options={options.category}
                selected={backendFilters.category || []}
                onChange={(v) => setBackendFilters((prev) => ({ ...prev, category: v }))}
              />
              <MultiSelect
                label={t.filterSource}
                options={options.source}
                selected={backendFilters.source || []}
                onChange={(v) => setBackendFilters((prev) => ({ ...prev, source: v }))}
              />
              <MultiSelect
                label={t.filterValueType}
                options={valueTypeOptions}
                selected={valueTypeFilter}
                onChange={setValueTypeFilter}
              />
              <MultiSelect
                label={t.filterFamily}
                options={familyOptions}
                selected={familyFilter}
                onChange={setFamilyFilter}
              />
              <div className="analyticsFilterField">
                <label className="analyticsFilterFieldLabel">{t.usageRangeLabel.replace("{{max}}", maxUsage)}</label>
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
            </div>
            <div className="analyticsFilterActions">
              <button
                type="button"
                className="analyticsFilterClear"
                onClick={() => {
                  setBackendFilters({});
                  setValueTypeFilter([]);
                  setFamilyFilter([]);
                  setUsageRange([0, Infinity]);
                  setSearch("");
                }}
              >
                {t.clearAllFilters}
              </button>
            </div>
          </div>
        ) : null}
        <div className="analyticsBulkBar">
          <span className="analyticsBulkInfo">
            {selectedRows.size} выбрано · {filteredRows.length} из {total}
          </span>
          <div className="analyticsBulkButtons">
            <button
              type="button"
              className={`analyticsRecalcToggle ${recalcOpen ? "analyticsRecalcToggle--active" : ""}`}
              onClick={handleToggleRecalc}
              title={t.recalcTitle}
            >
              <CalculatorIcon className="w-4 h-4" />
              {t.recalcToggle}{recalcRows.length ? ` (${recalcRows.length})` : ""}
            </button>
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
              {t.compare}
            </button>
            <button type="button" className="analyticsExportBtn" onClick={handleServerExportCsv} disabled={exporting}>
              {exporting ? t.exportLoading : t.exportCsvAll}
            </button>
            <button type="button" className="analyticsExportBtn" onClick={handleServerExportXlsx} disabled={exporting}>
              {exporting ? t.exportLoading : t.exportExcelAll}
            </button>
          </div>
        </div>
        {propertyNameOptions.length > 0 ? (
          <div className="analyticsPropertyChips">
            <span className="analyticsPropertyChipsLabel">{t.propertiesChipsLabel}</span>
            {propertyNameOptions.map(({ name, count }) => {
              const active = nameFilter.includes(name);
              const isCalc = ["ee_time", "ingredient_value", "ingredient_um", "ee_operation"].includes(name.toLowerCase());
              return (
                <button
                  key={name}
                  type="button"
                  className={`analyticsPropertyChip ${active ? "analyticsPropertyChip--active" : ""} ${isCalc ? "analyticsPropertyChip--calc" : ""}`}
                  onClick={() => {
                    setNameFilter((prev) => {
                      if (prev.includes(name)) return prev.filter((n) => n !== name);
                      return [...prev, name];
                    });
                  }}
                  title={`${name} (${count})`}
                >
                  {name}
                  <span className="analyticsPropertyChipCount">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {recalcOpen ? (
        <section className="analyticsRecalculationSection">
          <div className="analyticsRecalculationHeader">
            <h3 className="analyticsRecalculationTitle">{t.recalcTitle}</h3>
            <div className="analyticsRecalculationActions">
              <button
                type="button"
                className="analyticsExportBtn"
                onClick={handleRequestExportRecalculatedXlsx}
                disabled={exporting}
              >
                <DownloadIcon className="w-4 h-4" />
                {exporting ? t.exportLoading : t.exportExcelRecalc}
              </button>
              <button
                type="button"
                className="analyticsExportBtn analyticsExportBtn--secondary"
                onClick={handleServerExportAdvancedCalculationXlsx}
                disabled={exporting || scope !== "session"}
                title={scope === "session" ? t.advancedCalcTooltipSession : t.advancedCalcTooltipDisabled}
              >
                <DownloadIcon className="w-4 h-4" />
                {exporting ? t.exportLoading : t.exportExcelAdvanced}
              </button>
            </div>
          </div>
          {recalcLoading ? <AnalyticsLoading text={t.loadingRecalc} /> : null}
          {recalcError ? <AnalyticsError message={recalcError} onRetry={() => loadRecalculation()} /> : null}
          {!recalcLoading && !recalcError && !recalcRows.length ? (
            <EmptyState title={t.recalcEmptyTitle} description={t.recalcEmptyDescription} />
          ) : null}
          {!recalcLoading && !recalcError && recalcRows.length ? (
            <div className="analyticsRecalcTableWrap">
              <table className="analyticsRecalcTable">
                <thead>
                  <tr>
                    <th>BPMN Name</th>
                    <th>ee_time</th>
                    <th>ingredient_value</th>
                    <th>result</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {recalcRows.map((row, idx) => {
                    const rawIngredient = text(row.ingredient_value);
                    const sourceLabel =
                      row.source === "property"
                        ? "property"
                        : row.source === "расчёт по умолчанию"
                          ? "расчёт по умолчанию"
                          : "нет данных";
                    const sourceClass =
                      row.source === "property"
                        ? "property"
                        : row.source === "расчёт по умолчанию"
                          ? "default"
                          : "none";
                    return (
                      <tr key={row.bpmn_id || idx}>
                        <td>{text(row.bpmn_name) || text(row.bpmn_id) || "—"}</td>
                        <td>{row.ee_time != null ? Number(row.ee_time).toFixed(2) : "—"}</td>
                        <td>
                          {rawIngredient ? Number(rawIngredient).toFixed(2) : "—"}
                        </td>
                        <td>{row.result != null ? Number(row.result).toFixed(2) : "—"}</td>
                        <td>
                          <span className={`analyticsRecalcSource analyticsRecalcSource--${sourceClass}`}>
                            {sourceLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {loading && !rawRows.length ? <AnalyticsLoading text={t.loadingProperties} /> : null}
      {error ? <AnalyticsError message={error} onRetry={() => loadData()} /> : null}
      {!loading && !error && !rawRows.length ? (
        <EmptyState title={t.propertiesEmptyTitle} description={t.propertiesEmptyDescription} />
      ) : null}
      {rawRows.length > 0 ? (
        <>
          <div className="analyticsTableMeta">
            <span className="analyticsTableMetaInfo">
              {t.shownRecordsLabel.replace("{{shown}}", filteredRows.length).replace("{{total}}", total)}
              {total > 500 ? " · первые 500 загружены с сервера" : ""}
            </span>
          </div>
          <AnalyticsPropertiesTable
            rows={pagedRows}
            selectedRows={selectedRows}
            onToggleRow={toggleRow}
            onSelectAllVisible={selectAllVisible}
            sort={sort}
            onSort={toggleSort}
          />
          <Paginator page={page} totalPages={totalPages} onChange={setPage} />
        </>
      ) : null}
      {compareRows.length ? <CompareDrawer rows={compareRows} onClose={() => setCompareRows([])} /> : null}
      {sourceValidationModal.open ? (
        <Modal
          open
          title={t.sourceWarningTitle}
          onClose={() => setSourceValidationModal((m) => ({ ...m, open: false }))}
          footer={
            <div className="analyticsModalFooter">
              <button
                type="button"
                className="analyticsExportBtn analyticsExportBtn--secondary"
                onClick={() => setSourceValidationModal((m) => ({ ...m, open: false }))}
              >
                {t.gapsCancel}
              </button>
              <button
                type="button"
                className="analyticsExportBtn"
                onClick={handleConfirmExportRecalculatedXlsx}
                disabled={exporting}
              >
                {exporting ? t.exportLoading : t.gapsExport}
              </button>
            </div>
          }
        >
          <p className="analyticsGapsModalDescription">{sourceValidationModal.message}</p>
          {sourceValidationModal.tasks.length ? (
            <div className="analyticsGapsModalList">
              {sourceValidationModal.tasks.map((gap, idx) => {
                const ctx = gap.context || {};
                const prev = (ctx.prev_names || []).join(", ") || "…";
                const next = (ctx.next_names || []).join(", ") || "…";
                const position = ctx.prev_names?.length || ctx.next_names?.length
                  ? t.gapsContextBetween.replace("{{prev}}", prev).replace("{{next}}", next)
                  : ctx.x != null && ctx.y != null
                    ? `${t.gapsPositionCoordinates}: ${Math.round(ctx.x)}, ${Math.round(ctx.y)}`
                    : "—";
                return (
                  <a
                    key={idx}
                    href={gap.element_url || `/app?session=${encodeURIComponent(gap.session_id || "")}`}
                    className="analyticsGapsModalRow"
                    target="_blank"
                    rel="noreferrer"
                    title={gap.bpmn_name}
                  >
                    <span className="analyticsGapsModalName">{text(gap.bpmn_name) || text(gap.bpmn_id) || "—"}</span>
                    <span className="analyticsGapsModalPath">
                      {text(gap.project_title) || text(gap.project_id) || "—"} → {text(gap.session_title) || text(gap.session_id) || "—"}
                    </span>
                    <span className="analyticsGapsModalPosition">{position}</span>
                  </a>
                );
              })}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
