import { apiAdminListProjects } from "./adminApi";

export async function getAdminProjectsList(params = {}) {
  return apiAdminListProjects(params);
}

export default {
  getAdminProjectsList,
};

