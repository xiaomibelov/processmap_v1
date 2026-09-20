import SectionCard from "../common/SectionCard";
import { toInt, toText } from "../../utils/adminFormat";
import { dashboardDict } from "./dashboardI18n";

function formatGeneratedAt(raw) {
  const text = toText(raw);
  if (!text) return "";
  // ISO-строка из payload (generated_at) — показываем локальную часть без секунд.
  return text.slice(0, 16).replace("T", " ");
}

export default function SystemFactsStrip({ payload = {} }) {
  const d = dashboardDict();
  const parts = [];

  const redisMode = toText(payload?.redis_health?.mode);
  if (redisMode) parts.push({ label: d.systemRedis, value: redisMode });

  const queueEnabled = payload?.redis_health?.queue_enabled;
  const queueDepth = toInt(payload?.redis_health?.queue_depth, -1);
  if (typeof queueEnabled === "boolean" || queueDepth >= 0) {
    const state = queueEnabled ? d.systemQueueOn : d.systemQueueOff;
    parts.push({ label: d.systemQueue, value: queueDepth >= 0 ? `${state} · ${queueDepth}` : state });
  }

  const activeSessions = toInt(payload?.kpis?.active_sessions, -1);
  if (activeSessions >= 0) parts.push({ label: d.systemSessions, value: String(activeSessions) });

  const projects = toInt(payload?.kpis?.projects, -1);
  if (projects >= 0) parts.push({ label: d.systemProjects, value: String(projects) });

  const latency = toInt(payload?.kpis?.avg_save_latency_ms, -1);
  if (latency >= 0) parts.push({ label: d.systemSaveLatency, value: `${latency} ${d.latencyUnit}` });

  const generated = formatGeneratedAt(payload?.generated_at);
  if (generated) parts.push({ label: d.systemGenerated, value: generated });

  return (
    <SectionCard eyebrow={d.systemEyebrow} title={d.systemTitle}>
      {parts.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="system-empty">{d.systemEmpty}</div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600" data-testid="system-facts">
          {parts.map((part, index) => (
            <span key={part.label} className="flex items-center gap-1">
              {index > 0 ? <span className="text-slate-300" aria-hidden="true">·</span> : null}
              <span className="text-slate-400">{part.label}</span>
              <span className="font-medium text-slate-800">{part.value}</span>
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
