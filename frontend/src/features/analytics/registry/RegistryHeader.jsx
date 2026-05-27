import { useState, useRef, useEffect } from "react";

function HelpTooltip({ text }) {
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  function onEnter() {
    timer.current = setTimeout(() => setShow(true), 300);
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  }

  return (
    <span className="registryHelpWrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button type="button" className="registryHelpBtn" aria-label="Справка">
        ?
      </button>
      {show ? (
        <span className="registryHelpTooltip" role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export default function RegistryHeader({
  title = "Реестр действий",
  subtitle = "Действия с продуктами из сессий и проектов",
  helpText = "",
  exportOptions = [],
  onExport = null,
  exportLoading = "",
  onClose = null,
  page = false,
  onSwitchRegistry = null,
  switchLabel = "",
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="registryHeader" data-testid="registry-header">
      <div className="registryHeaderMain">
        <h2 className="registryTitle">{title}</h2>
        <p className="registrySubtitle">{subtitle}</p>
      </div>
      <div className="registryHeaderActions">
        {helpText ? <HelpTooltip text={helpText} /> : null}
        {onSwitchRegistry ? (
          <button type="button" className="registrySwitchBtn" onClick={onSwitchRegistry} data-testid="registry-switch">
            {switchLabel}
          </button>
        ) : null}
        {exportOptions.length > 0 ? (
          <div className="registryExportWrap" ref={exportRef}>
            <button
              type="button"
              className="registryExportBtn"
              onClick={() => setExportOpen((p) => !p)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              data-testid="registry-export-toggle"
            >
              <span aria-hidden="true">⬇</span> Export
            </button>
            {exportOpen ? (
              <div className="registryExportDropdown" role="menu">
                {exportOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="menuitem"
                    className="registryExportOption"
                    disabled={!!exportLoading}
                    onClick={() => {
                      setExportOpen(false);
                      onExport?.(opt);
                    }}
                  >
                    {exportLoading === opt.toLowerCase() ? `Готовлю ${opt}…` : opt}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {onClose ? (
          <button type="button" className="registryCloseBtn" onClick={onClose}>
            {page ? "Вернуться" : "Закрыть"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
