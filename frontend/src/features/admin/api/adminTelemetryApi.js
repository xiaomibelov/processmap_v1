import { apiAdminGetErrorEvent, apiAdminListErrorEvents } from "./adminApi";

export async function getAdminTelemetryErrorEvents(params = {}) {
  return apiAdminListErrorEvents(params);
}

export async function getAdminTelemetryErrorEvent(eventId) {
  return apiAdminGetErrorEvent(eventId);
}

export default {
  getAdminTelemetryErrorEvents,
  getAdminTelemetryErrorEvent,
};
