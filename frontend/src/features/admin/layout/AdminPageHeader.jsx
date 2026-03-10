import StatusPill from "../components/common/StatusPill";
import { toText } from "../adminUtils";

export default function AdminPageHeader({
  title = "",
  subtitle = "",
  badges = [],
  actions = null,
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{toText(title)}</h1>
          {toText(subtitle) ? <p className="mt-2 max-w-3xl text-sm text-slate-500">{toText(subtitle)}</p> : null}
          {badges.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {badges.map((badge, idx) => (
                <StatusPill
                  key={`${toText(badge?.label)}_${idx}`}
                  status={badge?.value ?? badge?.label}
                  tone={badge?.tone}
                  label={badge?.label}
                />
              ))}
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

