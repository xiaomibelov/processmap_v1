import { toText } from "../../adminUtils";

export default function SectionCard({
  title = "",
  subtitle = "",
  eyebrow = "",
  action = null,
  children = null,
  className = "",
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-3 ${className}`.trim()}>
      {(toText(title) || toText(subtitle) || toText(eyebrow) || action) ? (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {toText(eyebrow) ? <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{toText(eyebrow)}</div> : null}
            {toText(title) ? <h3 className="text-sm font-semibold text-slate-950">{toText(title)}</h3> : null}
            {toText(subtitle) ? <p className="text-xs text-slate-500">{toText(subtitle)}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

