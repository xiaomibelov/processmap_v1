import { apiAdminGetSession, apiAdminListSessions } from "./adminApi";

export async function getAdminSessionsList(params = {}) {
  return apiAdminListSessions(params);
}

export async function getAdminSessionDetail(sessionId) {
  return apiAdminGetSession(sessionId);
}

export default {
  getAdminSessionsList,
  getAdminSessionDetail,
};

