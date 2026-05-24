export default function ProductActionsRegistryHeader({
  title = "Реестр действий с продуктом",
  subtitle = "Сводная таблица действий с продуктами из сессий. Просмотр и экспорт перед финальной выгрузкой.",
  exportMeta = "",
  exportLoading = "",
  canExportRegistry = false,
  onExportCsv,
  onExportXlsx,
  exportStatus = "",
  onClose = null,
  page = false,
  children = null,
}) {
  return (
    <header className="productActionsRegistryHeader">
      <div className="productActionsRegistryHeaderMain">
        <div>
          <h2 className="productActionsRegistryTitle">{title}</h2>
          <p className="productActionsRegistrySubcopy">{subtitle}</p>
        </div>
      </div>
      <div className="productActionsRegistryHeaderRight">
        {onClose ? (
          <button
            type="button"
            className="productActionsRegistryBackBtn"
            onClick={onClose}
            data-testid="product-actions-registry-back"
          >
            {page ? "Вернуться" : "Закрыть"}
          </button>
        ) : null}
        <div className="productActionsRegistryExportBar">
          <button
            type="button"
            className="productActionsRegistryExportBtn"
            disabled={!canExportRegistry}
            onClick={onExportCsv}
            data-testid="product-actions-registry-export-csv"
          >
            {exportLoading === "csv" ? "Готовлю CSV…" : "CSV"}
          </button>
          <button
            type="button"
            className="productActionsRegistryExportBtn"
            disabled={!canExportRegistry}
            onClick={onExportXlsx}
            data-testid="product-actions-registry-export-xlsx"
          >
            {exportLoading === "xlsx" ? "Готовлю XLSX…" : "XLSX"}
          </button>
        </div>
        {exportMeta ? (
          <span className="productActionsRegistryExportMeta">{exportMeta}</span>
        ) : null}
        {exportStatus ? (
          <small className="productActionsRegistryExportStatus" data-testid="product-actions-registry-export-status">
            {exportStatus}
          </small>
        ) : null}
      </div>
      {children}
    </header>
  );
}
