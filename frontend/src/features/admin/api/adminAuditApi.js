import { apiAdminListAudit } from "./adminApi";

export async function getAdminAuditList(params = {}) {
  return apiAdminListAudit(params);
}

export default {
  getAdminAuditList,
};

