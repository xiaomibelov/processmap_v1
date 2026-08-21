import {
  deleteTemplate as deleteTemplateLocal,
  listTemplates as listTemplatesLocal,
  saveTemplate as saveTemplateLocal,
} from "./templatesApi.js";
import {
  apiCreateTemplate,
  apiCreateTemplateFolder,
  apiDeleteTemplate,
  apiDeleteTemplateFolder,
  apiListTemplates,
  apiListTemplateFolders,
  apiPatchTemplate,
  apiPatchTemplateFolder,
} from "../../../lib/api.js";
import { normalizeTemplateFolderRecord, normalizeTemplateRecord } from "../model/types.js";

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
  const payload = {
    bpmn_element_ids: Array.isArray(template.bpmn_element_ids) ? template.bpmn_element_ids : [],
    primary_element_id: String(template.primary_element_id || ""),
    selection_count: Number(template.selection_count || 0),
    element_types: Array.isArray(template.element_types) ? template.element_types : [],
    lane_names: Array.isArray(template.lane_names) ? template.lane_names : [],
    source_session_id: String(template.source_session_id || ""),
    notes: String(template.notes || ""),
    folder_id: String(template.folder_id || template.folderId || ""),
    meta: template.meta && typeof template.meta === "object" ? template.meta : {},
  };
  if (template.payload && typeof template.payload === "object") {
    return { ...payload, ...template.payload };
  }
  return payload;
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
      template_type: String(template.template_type || "bpmn_selection_v1"),
      org_id: scope === "org" ? orgId : "",
      folder_id: String(template.folder_id || template.folderId || ""),
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
    if (Object.prototype.hasOwnProperty.call(patchRaw, "folder_id") || Object.prototype.hasOwnProperty.call(patchRaw, "folderId")) {
      patch.folder_id = String(patchRaw.folder_id || patchRaw.folderId || "");
    }
    if (Object.prototype.hasOwnProperty.call(patchRaw, "payload")) {
      patch.payload = patchRaw.payload && typeof patchRaw.payload === "object" ? patchRaw.payload : {};
    }
    if (Object.prototype.hasOwnProperty.call(patchRaw, "template_type")) {
      patch.template_type = String(patchRaw.template_type || "");
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

export async function listTemplateFolders(params = {}) {
  const scope = String(params?.scope || "personal").trim().toLowerCase() === "org" ? "org" : "personal";
  const userId = String(params?.userId || "");
  const orgId = String(params?.orgId || "");
  const remote = await apiListTemplateFolders({ scope, orgId });
  if (!remote?.ok) return [];
  return (Array.isArray(remote.items) ? remote.items : [])
    .map((row) => normalizeTemplateFolderRecord(row, { scope, owner_user_id: userId, org_id: orgId }))
    .filter((row) => !!row.id);
}

export async function createTemplateFolder(params = {}) {
  const scope = String(params?.scope || "personal").trim().toLowerCase() === "org" ? "org" : "personal";
  const orgId = String(params?.orgId || "");
  const remote = await apiCreateTemplateFolder({
    scope,
    org_id: scope === "org" ? orgId : "",
    name: String(params?.name || ""),
    parent_id: String(params?.parentId || params?.parent_id || ""),
    sort_order: Number(params?.sortOrder || params?.sort_order || 0),
  });
  if (!remote?.ok) return remote;
  return {
    ok: true,
    item: normalizeTemplateFolderRecord(remote.item, { scope, org_id: orgId }),
    status: remote.status,
  };
}

export async function updateTemplateFolder(params = {}) {
  const folderId = String(params?.folderId || params?.id || "").trim();
  if (!folderId) return { ok: false, status: 0, error: "missing folder_id" };
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(params, "name")) patch.name = String(params.name || "");
  if (Object.prototype.hasOwnProperty.call(params, "parentId") || Object.prototype.hasOwnProperty.call(params, "parent_id")) {
    patch.parent_id = String(params.parentId || params.parent_id || "");
  }
  if (Object.prototype.hasOwnProperty.call(params, "sortOrder") || Object.prototype.hasOwnProperty.call(params, "sort_order")) {
    patch.sort_order = Number(params.sortOrder || params.sort_order || 0);
  }
  const remote = await apiPatchTemplateFolder(folderId, patch);
  if (!remote?.ok) return remote;
  return {
    ok: true,
    item: normalizeTemplateFolderRecord(remote.item),
    status: remote.status,
  };
}

export async function deleteTemplateFolder(params = {}) {
  const folderId = String(params?.folderId || params?.id || "").trim();
  if (!folderId) return { ok: false, status: 0, error: "missing folder_id" };
  return await apiDeleteTemplateFolder(folderId);
}
