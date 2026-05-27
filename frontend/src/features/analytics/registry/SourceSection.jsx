function toText(value) {
  return String(value || "").trim();
}

export default function SourceSection({ sources = [] }) {
  return (
    <div className="registrySourceSection" data-testid="registry-source-section">
      <div className="registrySourceSectionTitle">Источники данных</div>
      <div className="registrySourceList" role="list">
        {sources.map((s, i) => (
          <div key={i} className="registrySourceRow" role="listitem">
            <span
              className={`registrySourceIndicator ${s.active ? "isActive" : ""}`}
              aria-label={s.active ? "Активен" : "Неактивен"}
            />
            <span className="registrySourceName">{s.name}</span>
            <span className="registrySourceCount">
              {s.count != null ? `${s.count} записей` : s.active ? "0 записей" : "недоступно"}
            </span>
            <button type="button" className="registrySourceAction">
              {s.active ? "Просмотреть" : "Настроить"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
