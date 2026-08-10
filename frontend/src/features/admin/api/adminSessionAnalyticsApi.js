import {
  apiAdminGetSessionAnalyticsCaseStudies,
  apiAdminGetSessionAnalyticsSummary,
  apiAdminGetSessionAnalyticsTop,
} from "./adminApi";

export async function getSessionAnalyticsSummary(params = {}) {
  return apiAdminGetSessionAnalyticsSummary(params);
}

export async function getSessionAnalyticsTop(params = {}) {
  return apiAdminGetSessionAnalyticsTop(params);
}

export async function getSessionAnalyticsCaseStudies(params = {}) {
  return apiAdminGetSessionAnalyticsCaseStudies(params);
}

export default {
  getSessionAnalyticsSummary,
  getSessionAnalyticsTop,
  getSessionAnalyticsCaseStudies,
};
