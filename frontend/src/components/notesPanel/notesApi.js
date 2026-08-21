import {
  apiGetOrgPropertyDictionaryBundle,
  apiListOrgPropertyDictionaryOperations,
  apiUpsertOrgPropertyDictionaryValue,
} from "../../lib/api.js";

export async function listOrgPropertyDictionaryOperations(orgId, options = {}) {
  return apiListOrgPropertyDictionaryOperations(orgId, options);
}

export async function getOrgPropertyDictionaryBundle(orgId, operationKey, options = {}) {
  return apiGetOrgPropertyDictionaryBundle(orgId, operationKey, options);
}

export async function upsertOrgPropertyDictionaryValue(orgId, operationKey, propertyKey, payload = {}) {
  return apiUpsertOrgPropertyDictionaryValue(orgId, operationKey, propertyKey, payload);
}
