import { apiAdminGetCanvasTelemetryContext, apiAdminListCanvasTelemetryErrors } from "./adminApi";

export async function getAdminCanvasTelemetryErrors(params = {}) {
  return apiAdminListCanvasTelemetryErrors(params);
}

export async function getAdminCanvasTelemetryContext(groupId) {
  return apiAdminGetCanvasTelemetryContext(groupId);
}

export default {
  getAdminCanvasTelemetryErrors,
  getAdminCanvasTelemetryContext,
};
