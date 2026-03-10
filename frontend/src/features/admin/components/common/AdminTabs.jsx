import { toText } from "../../adminUtils";

export default function AdminTabs({
  tabs = [],
  activeTab = "",
  onChange,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = toText(tab?.id) === toText(activeTab);
        return (
          <button
            key={toText(tab?.id)}
            type="button"
            className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
              active
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
            }`}
            onClick={() => onChange?.(toText(tab?.id))}
          >
            {toText(tab?.label || tab?.id)}
          </button>
        );
      })}
    </div>
  );
}

