import { apiAdminListOrgs } from "./adminApi";

export async function getAdminOrgsList() {
  return apiAdminListOrgs();
}

export default {
  getAdminOrgsList,
};

