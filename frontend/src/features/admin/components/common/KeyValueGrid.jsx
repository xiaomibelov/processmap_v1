import { toText } from "../../adminUtils";

export default function KeyValueGrid({
  items = [],
  columnsClassName = "md:grid-cols-2 xl:grid-cols-3",
}) {
  return (
    <div className={`grid gap-2 ${columnsClassName}`.trim()}>
      {items.map((item, idx) => (
        <div key={`${toText(item?.label)}_${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{toText(item?.label)}</div>
          <div className="mt-1 text-sm font-medium text-slate-950">{item?.value ?? "—"}</div>
          {toText(item?.hint) ? <div className="mt-0.5 text-[11px] text-slate-500">{toText(item?.hint)}</div> : null}
        </div>
      ))}
    </div>
  );
}

