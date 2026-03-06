import { apiAdminGetDashboard } from "./adminApi";

export async function getAdminDashboard(params = {}) {
  return apiAdminGetDashboard(params);
}

export default {
  getAdminDashboard,
};

