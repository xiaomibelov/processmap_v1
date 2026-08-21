import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function QueueHealthWidget({
  payload = {},
}) {
  const mode = toText(payload?.mode || "UNKNOWN");
  const modeLower = mode.toLowerCase();
  const modeTone = (
    modeLower === "error" || modeLower === "incident" || modeLower === "misconfigured"
      ? "danger"
      : modeLower === "fallback" || modeLower === "off" || modeLower === "degraded"
        ? "warn"
        : "ok"
  );
  return (
    <SectionCard title={ru.admin.jobsPage.queue.title} subtitle={ru.admin.jobsPage.queue.subtitle} eyebrow={ru.admin.jobsPage.queue.eyebrow}>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">{ru.admin.jobsPage.queue.mode}</div>
          <div className="mt-2"><StatusPill status={mode} tone={modeTone} /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">{ru.admin.jobsPage.queue.enabled}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{payload?.enabled ? ru.common.yes : ru.common.no}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">{ru.admin.jobsPage.queue.depth}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{toInt(payload?.queue_depth, 0)}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-500">{toText(payload?.reason || "") || ru.admin.jobsPage.queue.healthy}</div>
    </SectionCard>
  );
}
