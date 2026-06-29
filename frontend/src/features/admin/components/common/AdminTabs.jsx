import { toText } from "../../adminUtils";

export default function AdminTabs({
  tabs = [],
  activeTab = "",
  onChange,
}) {
  return (
    <div className="flex flex-wrap gap-4 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = toText(tab?.id) === toText(activeTab);
        return (
          <button
            key={toText(tab?.id)}
            type="button"
            className={`relative h-8 px-1 pb-2 pt-1 text-sm font-medium transition ${
              active
                ? "text-emerald-700 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-emerald-500"
                : "text-slate-500 hover:text-slate-950"
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
