import { apiAdminListJobs } from "./adminApi";

export async function getAdminJobsList() {
  return apiAdminListJobs();
}

export default {
  getAdminJobsList,
};

