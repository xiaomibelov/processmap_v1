import { ADMIN_PAGE_SIZE_OPTIONS } from "../../utils/adminQuery";

function clampPage(value, totalPages) {
  const page = Number(value || 1);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.round(page)), Math.max(1, totalPages));
}

function renderPages(currentPage, totalPages) {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const prepared = Array.from(pages)
    .filter((item) => item >= 1 && item <= totalPages)
    .sort((a, b) => a - b);
  const out = [];
  prepared.forEach((item, idx) => {
    out.push(item);
    const next = prepared[idx + 1];
    if (next && next - item > 1) out.push("...");
  });
  return out;
}

export default function AdminTablePagination({
  total = 0,
  page = 1,
  pageSize = 20,
  pageSizeOptions = ADMIN_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  className = "",
  testIdPrefix = "admin-pagination",
}) {
  const totalItems = Math.max(0, Number(total || 0));
  const size = pageSizeOptions.includes(Number(pageSize || 0)) ? Number(pageSize) : pageSizeOptions[0] || 20;
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, size)));
  const currentPage = clampPage(page, totalPages);
  const from = totalItems > 0 ? (currentPage - 1) * size + 1 : 0;
  const to = totalItems > 0 ? Math.min(totalItems, currentPage * size) : 0;
  const pageItems = renderPages(currentPage, totalPages);

  return (
    <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 ${className}`.trim()}>
      <div className="text-xs text-slate-600">
        {`Показано ${from}-${to} из ${totalItems}`}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-600" htmlFor={`${testIdPrefix}-size`}>
          <span>Размер</span>
          <select
            id={`${testIdPrefix}-size`}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
            value={String(size)}
            onChange={(event) => onPageSizeChange?.(Number(event.target.value || size))}
            data-testid={`${testIdPrefix}-size`}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={String(option)}>{option}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondaryBtn h-8 min-h-0 rounded-xl px-3 py-0 text-xs"
          disabled={currentPage <= 1}
          onClick={() => onPageChange?.(currentPage - 1)}
          data-testid={`${testIdPrefix}-prev`}
        >
          Назад
        </button>
        <div className="flex items-center gap-1">
          {pageItems.map((item, idx) => (
            item === "..." ? (
              <span key={`ellipsis_${idx}`} className="px-1 text-xs text-slate-400">…</span>
            ) : (
              <button
                key={`page_${item}`}
                type="button"
                className={`h-8 min-h-0 rounded-lg border px-2 text-xs ${item === currentPage ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                onClick={() => onPageChange?.(item)}
                data-testid={`${testIdPrefix}-page-${item}`}
              >
                {item}
              </button>
            )
          ))}
        </div>
        <button
          type="button"
          className="secondaryBtn h-8 min-h-0 rounded-xl px-3 py-0 text-xs"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange?.(currentPage + 1)}
          data-testid={`${testIdPrefix}-next`}
        >
          Вперёд
        </button>
      </div>
    </div>
  );
}
