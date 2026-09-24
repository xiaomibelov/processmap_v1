import { apiRoutes } from "../apiRoutes.js";
import { apiRequest as request, okOrError } from "../apiCore.js";

export async function apiGetCanvasGeometry() {
  const r = okOrError(await request(apiRoutes.canvasGeometry.get(), { method: "GET" }));
  return r.ok ? { ok: true, settings: r.data?.settings || null } : r;
}

export async function apiPutCanvasGeometry(settings = {}) {
  const r = okOrError(
    await request(apiRoutes.admin.canvasGeometry(), {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { "Content-Type": "application/json" },
    })
  );
  return r.ok ? { ok: true, settings: r.data?.settings || null } : r;
}
