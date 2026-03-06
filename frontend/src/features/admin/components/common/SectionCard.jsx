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
    <section className={`rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.28)] ${className}`.trim()}>
      {(toText(title) || toText(subtitle) || toText(eyebrow) || action) ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {toText(eyebrow) ? <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{toText(eyebrow)}</div> : null}
            {toText(title) ? <h3 className="mt-1 text-sm font-semibold text-slate-950">{toText(title)}</h3> : null}
            {toText(subtitle) ? <p className="mt-1 text-xs text-slate-500">{toText(subtitle)}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

