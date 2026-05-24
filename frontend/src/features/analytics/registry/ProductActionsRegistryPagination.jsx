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

export default function ProductActionsRegistryPagination({
  page = 1,
  pageSize = 25,
  totalRows = 0,
  onPageChange,
  onPageSizeChange,
}) {
  const totalItems = Math.max(0, Number(totalRows || 0));
  const sizeOptions = [25, 50];
  const size = sizeOptions.includes(Number(pageSize || 0)) ? Number(pageSize) : sizeOptions[0];
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, size)));
  const currentPage = clampPage(page, totalPages);
  const from = totalItems > 0 ? (currentPage - 1) * size + 1 : 0;
  const to = totalItems > 0 ? Math.min(totalItems, currentPage * size) : 0;
  const pageItems = renderPages(currentPage, totalPages);

  return (
    <div className="productActionsRegistryPagination" data-testid="product-actions-registry-pagination">
      <div className="productActionsRegistryPaginationMeta">
        {`Показано ${from}-${to} из ${totalItems}`}
      </div>
      <div className="productActionsRegistryPaginationControls">
        <label htmlFor="registry-page-size">
          <span>Размер</span>
          <select
            id="registry-page-size"
            value={String(size)}
            onChange={(event) => onPageSizeChange?.(Number(event.target.value || size))}
            data-testid="product-actions-registry-page-size"
          >
            {sizeOptions.map((option) => (
              <option key={option} value={String(option)}>{option}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange?.(currentPage - 1)}
          data-testid="product-actions-registry-page-prev"
        >
          Назад
        </button>
        <div className="productActionsRegistryPaginationPages">
          {pageItems.map((item, idx) =>
            item === "..." ? (
              <span key={`ellipsis_${idx}`} className="productActionsRegistryPaginationEllipsis">…</span>
            ) : (
              <button
                key={`page_${item}`}
                type="button"
                className={item === currentPage ? "isActive" : ""}
                onClick={() => onPageChange?.(item)}
                data-testid={`product-actions-registry-page-${item}`}
              >
                {item}
              </button>
            )
          )}
        </div>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange?.(currentPage + 1)}
          data-testid="product-actions-registry-page-next"
        >
          Вперёд
        </button>
      </div>
    </div>
  );
}
