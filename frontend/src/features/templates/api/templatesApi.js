import { normalizeTemplateRecord, normalizeTemplateScope } from "../model/types.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

const STORAGE_PREFIX = "fpc_templates_v1";

function storageKey({ scope = "personal", userId = "", orgId = "" } = {}) {
  const normalizedScope = normalizeTemplateScope(scope);
  if (normalizedScope === "org") {
    return `${STORAGE_PREFIX}:org:${toText(orgId) || "no_org"}`;
  }
  return `${STORAGE_PREFIX}:personal:${toText(userId) || "anonymous"}`;
}

function readTemplatesFromStorage(key) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return asArray(parsed).map((row) => normalizeTemplateRecord(row)).filter((row) => !!row.id);
  } catch {
    return [];
  }
}

function writeTemplatesToStorage(key, items) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage?.setItem(key, JSON.stringify(asArray(items)));
    return true;
  } catch {
    return false;
  }
}

function sortByUpdated(items) {
  return asArray(items)
    .slice()
    .sort((a, b) => Number(b?.updated_at || 0) - Number(a?.updated_at || 0) || String(a?.title || "").localeCompare(String(b?.title || ""), "ru"));
}

export async function listTemplates({ scope = "personal", userId = "", orgId = "" } = {}) {
  const key = storageKey({ scope, userId, orgId });
  return sortByUpdated(readTemplatesFromStorage(key));
}

export async function saveTemplate({ scope = "personal", userId = "", orgId = "", template } = {}) {
  const normalizedScope = normalizeTemplateScope(scope);
  const key = storageKey({ scope: normalizedScope, userId, orgId });
  const existing = readTemplatesFromStorage(key);
  const normalized = normalizeTemplateRecord(template, {
    scope: normalizedScope,
    user_id: userId,
    org_id: orgId,
  });
  const next = existing.filter((row) => row.id !== normalized.id);
  next.unshift({
    ...normalized,
    scope: normalizedScope,
    user_id: normalizedScope === "personal" ? toText(userId) : "",
    org_id: normalizedScope === "org" ? toText(orgId) : "",
    updated_at: Date.now(),
  });
  const ok = writeTemplatesToStorage(key, sortByUpdated(next));
  return ok
    ? { ok: true, item: normalizeTemplateRecord(next[0]) }
    : { ok: false, error: "template_save_failed" };
}

export async function deleteTemplate({ scope = "personal", userId = "", orgId = "", templateId = "" } = {}) {
  const key = storageKey({ scope, userId, orgId });
  const id = toText(templateId);
  if (!id) return { ok: false, error: "template_id_required" };
  const existing = readTemplatesFromStorage(key);
  const next = existing.filter((row) => row.id !== id);
  const ok = writeTemplatesToStorage(key, next);
  return ok ? { ok: true } : { ok: false, error: "template_delete_failed" };
}
