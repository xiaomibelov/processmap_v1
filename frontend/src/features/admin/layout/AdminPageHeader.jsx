import StatusPill from "../components/common/StatusPill";
import { toText } from "../adminUtils";

export default function AdminPageHeader({
  title = "",
  subtitle = "",
  badges = [],
  actions = null,
}) {
  return (
    <section className="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        <h1 className="truncate text-base font-semibold tracking-tight text-slate-950">{toText(title)}</h1>
        {toText(subtitle) ? (
          <p className="hidden truncate text-xs text-slate-500 md:block">{toText(subtitle)}</p>
        ) : null}
        {badges.length ? (
          <div className="flex shrink-0 items-center gap-2">
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
    </section>
  );
}

