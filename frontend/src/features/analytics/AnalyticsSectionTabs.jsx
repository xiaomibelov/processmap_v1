const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "actions", label: "Реестр действий" },
  { key: "properties", label: "Реестр свойств" },
  { key: "dashboards", label: "Дашборды" },
];

export default function AnalyticsSectionTabs({ activeTab = "overview", onChange }) {
  return (
    <nav className="analyticsSectionTabs" role="tablist" aria-label="Разделы аналитики">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={activeTab === tab.key ? "analyticsSectionTab isActive" : "analyticsSectionTab"}
          onClick={() => onChange?.(tab.key)}
          data-testid={`analytics-tab-${tab.key}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
