import {
  createTemplateFolder,
  deleteTemplateFolder,
  listTemplateFolders,
  listTemplateFoldersWithStatus,
  updateTemplateFolder,
} from "../api/index.js";

export async function listFolders(params = {}) {
  return await listTemplateFolders(params);
}

export async function listFoldersWithStatus(params = {}) {
  return await listTemplateFoldersWithStatus(params);
}

export async function createFolder(params = {}) {
  return await createTemplateFolder(params);
}

export async function patchFolder(params = {}) {
  return await updateTemplateFolder(params);
}

export async function removeFolder(params = {}) {
  return await deleteTemplateFolder(params);
}
