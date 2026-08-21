import { toText } from "../../adminUtils";

export default function ActiveFiltersSummary({
  items = [],
}) {
  const active = items.filter((item) => toText(item?.value));
  if (!active.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {active.map((item, idx) => (
        <span key={`${toText(item?.label)}_${idx}`} className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] text-slate-600">
          {toText(item?.label)}: {toText(item?.value)}
        </span>
      ))}
    </div>
  );
}

