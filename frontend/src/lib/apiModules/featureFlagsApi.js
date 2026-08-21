import { apiRoutes } from "../apiRoutes.js";
import { apiRequest as request, okOrError } from "../apiCore.js";

export async function apiGetFeatureFlags() {
  const r = okOrError(await request(apiRoutes.featureFlags.get(), { method: "GET" }));
  return r.ok ? { ok: true, flags: r.data?.flags || {} } : r;
}

export async function apiPatchFeatureFlags(flags = {}) {
  const r = okOrError(
    await request(apiRoutes.admin.featureFlagsPatch(), {
      method: "PATCH",
      body: JSON.stringify({ flags }),
      headers: { "Content-Type": "application/json" },
    })
  );
  return r.ok ? { ok: true, flags: r.data?.flags || {} } : r;
}
