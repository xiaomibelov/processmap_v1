import { requestJson } from "./http";

export async function apiMeta() {
  const r = await requestJson("/api/meta");
  if (!r.ok) return r;
  return { ok: true, status: r.status };
}
