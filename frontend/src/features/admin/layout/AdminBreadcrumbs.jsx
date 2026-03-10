import { toText } from "../adminUtils";

export default function AdminBreadcrumbs({
  items = [],
  onNavigate,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {items.map((item, idx) => {
        const label = toText(item?.label);
        const href = toText(item?.href);
        return (
          <span key={`${label}_${idx}`} className="inline-flex items-center gap-2">
            {idx > 0 ? <span className="text-slate-400/60">/</span> : null}
            {href ? (
              <button type="button" className="hover:text-slate-900" onClick={() => onNavigate?.(href)}>
                {label}
              </button>
            ) : (
              <span className="font-medium text-slate-700">{label}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

