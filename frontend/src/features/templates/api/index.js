import {
  deleteTemplate as deleteTemplateLocal,
  listTemplates as listTemplatesLocal,
  saveTemplate as saveTemplateLocal,
} from "./templatesApi.js";
import {
  apiCreateTemplate,
  apiDeleteTemplate,
  apiListTemplates,
  apiPatchTemplate,
} from "../../../lib/api.js";
import { normalizeTemplateRecord } from "../model/types.js";

function shouldFallbackLocal(result) {
  const status = Number(result?.status || 0);
  return status === 404 || status === 405 || status === 501;
}

function toNormalizedList(itemsRaw, defaults = {}) {
  return (Array.isArray(itemsRaw) ? itemsRaw : [])
    .map((row) => normalizeTemplateRecord(row, defaults))
    .filter((row) => !!row.id);
}

function toPayloadTemplate(templateRaw) {
  const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
  return {
    bpmn_element_ids: Array.isArray(template.bpmn_element_ids) ? template.bpmn_element_ids : [],
    primary_element_id: String(template.primary_element_id || ""),
    selection_count: Number(template.selection_count || 0),
    element_types: Array.isArray(template.element_types) ? template.element_types : [],
    lane_names: Array.isArray(template.lane_names) ? template.lane_names : [],
    source_session_id: String(template.source_session_id || ""),
    notes: String(template.notes || ""),
    meta: template.meta && typeof template.meta === "object" ? template.meta : {},
  };
}

export async function listTemplates(params = {}) {
  const scope = String(params?.scope || "personal").trim().toLowerCase() === "org" ? "org" : "personal";
  const userId = String(params?.userId || "");
  const orgId = String(params?.orgId || "");
  const remote = await apiListTemplates({ scope, orgId });
  if (remote?.ok) {
    return toNormalizedList(remote.items, { scope, user_id: userId, org_id: orgId });
  }
  if (!shouldFallbackLocal(remote)) return [];
  return listTemplatesLocal(params);
}

export async function createTemplate(params = {}) {
  const scope = String(params?.scope || "personal").trim().toLowerCase() === "org" ? "org" : "personal";
  const userId = String(params?.userId || "");
  const orgId = String(params?.orgId || "");
  const template = params?.template && typeof params.template === "object" ? params.template : {};
  const name = String(template.title || template.name || "").trim();
  const description = String(template.description || "").trim();
  const remote = await apiCreateTemplate({
    scope,
    org_id: scope === "org" ? orgId : "",
    name,
    description,
    payload: toPayloadTemplate(template),
  });
  if (remote?.ok) {
    return {
      ok: true,
      item: normalizeTemplateRecord(remote.item, { scope, user_id: userId, org_id: orgId }),
      status: remote.status,
    };
  }
  if (!shouldFallbackLocal(remote)) return remote;
  return saveTemplateLocal(params);
}

export async function updateTemplate(params = {}) {
  const templateId = String(params?.templateId || params?.id || params?.template?.id || "").trim();
  const patchRaw = params?.patch && typeof params.patch === "object"
    ? params.patch
    : (params?.template && typeof params.template === "object" ? params.template : {});
  if (templateId) {
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(patchRaw, "title") || Object.prototype.hasOwnProperty.call(patchRaw, "name")) {
      patch.name = String(patchRaw.title || patchRaw.name || "");
    }
    if (Object.prototype.hasOwnProperty.call(patchRaw, "description")) {
      patch.description = String(patchRaw.description || "");
    }
    if (Object.prototype.hasOwnProperty.call(patchRaw, "payload")) {
      patch.payload = patchRaw.payload && typeof patchRaw.payload === "object" ? patchRaw.payload : {};
    }
    const remote = await apiPatchTemplate(templateId, patch);
    if (remote?.ok) {
      return {
        ok: true,
        item: normalizeTemplateRecord(remote.item),
        status: remote.status,
      };
    }
    if (!shouldFallbackLocal(remote)) return remote;
  }
  return saveTemplateLocal(params);
}

export async function deleteTemplate(params = {}) {
  const templateId = String(params?.templateId || params?.id || "").trim();
  if (templateId) {
    const remote = await apiDeleteTemplate(templateId);
    if (remote?.ok) return { ok: true, status: remote.status };
    if (!shouldFallbackLocal(remote)) return remote;
  }
  return deleteTemplateLocal(params);
}
