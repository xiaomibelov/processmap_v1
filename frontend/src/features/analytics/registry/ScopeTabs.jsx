export default function ScopeTabs({ tabs = [], onChange = null }) {
  return (
    <div className="registryScopeTabs" role="tablist" aria-label="Источник строк реестра" data-testid="registry-scope-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.active}
          className={tab.active ? "isActive" : ""}
          onClick={() => onChange?.(tab.id)}
          data-testid={`registry-scope-tab-${tab.id}`}
        >
          {tab.count != null ? `${tab.label} (${tab.count})` : tab.label}
        </button>
      ))}
    </div>
  );
}
