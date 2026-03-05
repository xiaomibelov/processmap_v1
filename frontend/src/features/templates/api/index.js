import {
  deleteTemplate as deleteTemplateLocal,
  listTemplates as listTemplatesLocal,
  saveTemplate as saveTemplateLocal,
} from "./templatesApi.js";

export async function listTemplates(params = {}) {
  return listTemplatesLocal(params);
}

export async function createTemplate(params = {}) {
  return saveTemplateLocal(params);
}

export async function updateTemplate(params = {}) {
  return saveTemplateLocal(params);
}

export async function deleteTemplate(params = {}) {
  return deleteTemplateLocal(params);
}
