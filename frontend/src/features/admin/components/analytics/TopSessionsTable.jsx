import { useEffect, useState } from "react";

import AdminTablePagination from "../common/AdminTablePagination";
import SectionCard from "../common/SectionCard";
import { analyticsStatusMeta, formatDurationSeconds } from "./analyticsFormat";

const COLUMNS = [
  { key: "", label: "Сессия", sortable: false },
  { key: "author", label: "Автор", sortable: true },
  { key: "version_count", label: "Версии", sortable: true },
  { key: "lifetime", label: "Время жизни", sortable: true },
  { key: "last_updated", label: "Обновлена", sortable: true },
  { key: "", label: "Статус", sortable: false },
];

// Server-driven table: header clicks / author filter / pagination only
// change query params; sorting and slicing happen on the backend.
export default function TopSessionsTable({
  payload = {},
  loading = false,
  filters = {},
  onFiltersChange,
  onPagingChange,
}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const [authorInput, setAuthorInput] = useState(filters.filterAuthor || "");
  useEffect(() => {
    setAuthorInput(filters.filterAuthor || "");
  }, [filters.filterAuthor]);

  const sortBy = filters.sortBy || "version_count";
  const sortOrder = filters.sortOrder || "desc";

  function handleSort(key) {
    if (!key) return;
    if (key === sortBy) {
      onFiltersChange?.({ sortBy: key, sortOrder: sortOrder === "desc" ? "asc" : "desc" });
      return;
    }
    onFiltersChange?.({ sortBy: key, sortOrder: "desc" });
  }

  function applyAuthorFilter() {
    onFiltersChange?.({ filterAuthor: authorInput.trim() });
  }

  return (
    <SectionCard
      title="Топ сессий"
      subtitle="Сортировка и фильтры вычисляются на сервере"
      eyebrow="Sessions"
      action={(
        <div className="flex items-center gap-2">
          <input
            className="input sidebarInput h-7 min-h-0 w-48"
            placeholder="Фильтр по автору"
            value={authorInput}
            onChange={(event) => setAuthorInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyAuthorFilter();
            }}
            data-testid="analytics-author-filter"
          />
          <button
            type="button"
            className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs"
            onClick={applyAuthorFilter}
            data-testid="analytics-author-filter-apply"
          >
            Применить
          </button>
        </div>
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" data-testid="analytics-top-table">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              {COLUMNS.map((col) => (
                <th key={col.label} className="px-2 py-1.5 font-medium">
                  {col.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                      onClick={() => handleSort(col.key)}
                      data-testid={`analytics-sort-${col.key}`}
                    >
                      {col.label}
                      {sortBy === col.key ? <span aria-hidden="true">{sortOrder === "desc" ? "↓" : "↑"}</span> : null}
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-2 py-4 text-center text-slate-500">
                  {loading ? "Загрузка…" : "Нет данных"}
                </td>
              </tr>
            ) : items.map((item) => {
              const meta = analyticsStatusMeta(item.status);
              return (
                <tr key={item.id} className="border-b border-slate-100 text-slate-700" data-testid={`analytics-top-row-${item.id}`}>
                  <td className="max-w-[220px] truncate px-2 py-1.5" title={item.title}>{item.title || item.id}</td>
                  <td className="px-2 py-1.5">{item.author_email || "—"}</td>
                  <td className="px-2 py-1.5">{item.version_count}</td>
                  <td className="px-2 py-1.5">{formatDurationSeconds(item.lifetime_seconds)}</td>
                  <td className="px-2 py-1.5">{item.last_updated_relative || "—"}</td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${meta.className}`}>
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AdminTablePagination
        total={Number(payload.total || 0)}
        page={Number(payload.page || 1)}
        pageSize={Number(payload.page_size || 20)}
        onPageChange={(page) => onPagingChange?.({ page })}
        onPageSizeChange={(pageSize) => onPagingChange?.({ pageSize })}
        testIdPrefix="analytics-top-pagination"
      />
    </SectionCard>
  );
}
