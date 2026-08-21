import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { toInt, toText } from "../../utils/adminFormat";

export default function SessionWarningsPanel({
  warnings = {},
}) {
  return (
    <SectionCard title="Warnings / Errors" subtitle="Top issues collected from workspace markers and quality checks" eyebrow="Attention">
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-xs text-amber-700">Warnings</div>
          <div className="mt-1 text-xl font-semibold text-amber-900">{toInt(warnings?.warnings_count, 0)}</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <div className="text-xs text-rose-700">Errors</div>
          <div className="mt-1 text-xl font-semibold text-rose-900">{toInt(warnings?.errors_count, 0)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-xs text-slate-500">AutoPass Error</div>
          <div className="mt-1 text-sm text-slate-950">{toText(warnings?.autopass_error || "—")}</div>
          {toText(warnings?.autopass_error) ? <div className="mt-1"><StatusPill status="autopass_error" tone="danger" compact /></div> : null}
        </div>
      </div>
    </SectionCard>
  );
}

