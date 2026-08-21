import { asObject, toInt, toText } from "../utils/adminFormat";

export function mapAdminDashboardPayload(payload = {}) {
  const src = asObject(payload);
  const kpis = asObject(src.kpis);
  return {
    ...src,
    kpis: {
      ...kpis,
      organizations: toInt(kpis.organizations, 0),
      projects: toInt(kpis.projects, 0),
      active_sessions: toInt(kpis.active_sessions, 0),
      redis_mode: toText(kpis.redis_mode || "UNKNOWN"),
    },
  };
}

