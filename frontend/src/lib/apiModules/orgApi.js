import { isPlainObject } from "../apiClient.js";
import { apiRoutes } from "../apiRoutes.js";
import { apiRequest as request, getActiveOrgId, okOrError, setActiveOrgId } from "../apiCore.js";

export async function apiListOrgs() {
  const r = okOrError(await request(apiRoutes.orgs.list(), { method: "GET", retryAuth: true }));
  if (!r.ok) return r;
  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  const active_org_id = String(r.data?.active_org_id || "").trim();
  const default_org_id = String(r.data?.default_org_id || "").trim();
  if (active_org_id) setActiveOrgId(active_org_id);
  return { ok: true, status: r.status, items, active_org_id, default_org_id };
}

export async function apiCreateOrg(name) {
  const orgName = String(name || "").trim();
  if (!orgName) return { ok: false, status: 0, error: "name is required" };
  const r = okOrError(await request(apiRoutes.orgs.list(), { method: "POST", body: { name: orgName } }));
  return r.ok ? { ok: true, status: r.status, org: r.data || {} } : r;
}

export async function apiAssignOrgMember(orgId, userId, role = "org_viewer") {
  const oid = String(orgId || "").trim();
  const uid = String(userId || "").trim();
  if (!oid || !uid) return { ok: false, status: 0, error: "org_id and user_id required" };
  const r = okOrError(await request(apiRoutes.orgs.memberAssign(oid), {
    method: "POST",
    body: { user_id: uid, role: String(role || "org_viewer").trim() },
  }));
  return r.ok ? { ok: true, status: r.status, ...r.data } : r;
}

// ------- Templates -------
export async function apiListTemplates({ scope = "personal", orgId = "", limit = 200 } = {}) {
  const normalizedScope = String(scope || "").trim().toLowerCase() === "org" ? "org" : "personal";
  const oid = String(orgId || "").trim();
  const endpoint = (() => {
    const base = apiRoutes.templates.list(normalizedScope, oid);
    if (Number(limit || 0) <= 0) return base;
    const cap = String(Math.max(1, Math.min(1000, Number(limit || 200))));
    return `${base}${base.includes("?") ? "&" : "?"}limit=${encodeURIComponent(cap)}`;
  })();
  const r = okOrError(await request(endpoint, { method: "GET" }));
  if (!r.ok) return r;
  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  return {
    ok: true,
    status: r.status,
    scope: String(r.data?.scope || normalizedScope),
    org_id: String(r.data?.org_id || oid),
    count: Number(r.data?.count || items.length || 0),
    items,
  };
}

export async function apiCreateTemplate(payload = {}) {
  const body = {
    scope: String(payload?.scope || "personal"),
    template_type: String(payload?.template_type || payload?.templateType || "bpmn_selection_v1"),
    org_id: String(payload?.org_id || payload?.orgId || ""),
    folder_id: String(payload?.folder_id || payload?.folderId || ""),
    name: String(payload?.name || ""),
    description: String(payload?.description || ""),
    payload: payload?.payload && typeof payload.payload === "object" ? payload.payload : {},
  };
  const r = okOrError(await request(apiRoutes.templates.create(), { method: "POST", body }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    item: r.data?.item || {},
  };
}

export async function apiPatchTemplate(templateId, patch = {}) {
  const tid = String(templateId || "").trim();
  if (!tid) return { ok: false, status: 0, error: "missing template_id" };
  const body = {};
  if (patch && Object.prototype.hasOwnProperty.call(patch, "name")) body.name = String(patch.name || "");
  if (patch && Object.prototype.hasOwnProperty.call(patch, "description")) body.description = String(patch.description || "");
  if (patch && Object.prototype.hasOwnProperty.call(patch, "folder_id")) body.folder_id = String(patch.folder_id || "");
  if (patch && Object.prototype.hasOwnProperty.call(patch, "payload")) body.payload = patch.payload && typeof patch.payload === "object" ? patch.payload : {};
  if (patch && Object.prototype.hasOwnProperty.call(patch, "template_type")) body.template_type = String(patch.template_type || "");
  const r = okOrError(await request(apiRoutes.templates.item(tid), { method: "PATCH", body }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    item: r.data?.item || {},
  };
}

export async function apiDeleteTemplate(templateId) {
  const tid = String(templateId || "").trim();
  if (!tid) return { ok: false, status: 0, error: "missing template_id" };
  const r = okOrError(await request(apiRoutes.templates.item(tid), { method: "DELETE" }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
  };
}

export async function apiListTemplateFolders({ scope = "personal", orgId = "" } = {}) {
  const normalizedScope = String(scope || "").trim().toLowerCase() === "org" ? "org" : "personal";
  const endpoint = apiRoutes.templateFolders.list(normalizedScope, String(orgId || "").trim());
  const r = okOrError(await request(endpoint, { method: "GET" }));
  if (!r.ok) return r;
  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  return {
    ok: true,
    status: r.status,
    scope: String(r.data?.scope || normalizedScope),
    org_id: String(r.data?.org_id || ""),
    count: Number(r.data?.count || items.length || 0),
    items,
  };
}

export async function apiCreateTemplateFolder(payload = {}) {
  const body = {
    scope: String(payload?.scope || "personal"),
    org_id: String(payload?.org_id || payload?.orgId || ""),
    name: String(payload?.name || ""),
    parent_id: String(payload?.parent_id || payload?.parentId || ""),
    sort_order: Number(payload?.sort_order || payload?.sortOrder || 0),
  };
  const r = okOrError(await request(apiRoutes.templateFolders.create(), { method: "POST", body }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    item: r.data?.item || {},
  };
}

export async function apiPatchTemplateFolder(folderId, patch = {}) {
  const fid = String(folderId || "").trim();
  if (!fid) return { ok: false, status: 0, error: "missing folder_id" };
  const body = {};
  if (patch && Object.prototype.hasOwnProperty.call(patch, "name")) body.name = String(patch.name || "");
  if (patch && Object.prototype.hasOwnProperty.call(patch, "parent_id")) body.parent_id = String(patch.parent_id || "");
  if (patch && Object.prototype.hasOwnProperty.call(patch, "sort_order")) body.sort_order = Number(patch.sort_order || 0);
  const r = okOrError(await request(apiRoutes.templateFolders.item(fid), { method: "PATCH", body }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    item: r.data?.item || {},
  };
}

export async function apiDeleteTemplateFolder(folderId) {
  const fid = String(folderId || "").trim();
  if (!fid) return { ok: false, status: 0, error: "missing folder_id" };
  const r = okOrError(await request(apiRoutes.templateFolders.item(fid), { method: "DELETE" }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
  };
}

// ------- Enterprise Org Settings -------
export async function apiListOrgMembers(orgId) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const endpoint = apiRoutes.orgs.members(oid);
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiListOrgAssignableUsers(orgId) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const endpoint = apiRoutes.orgs.assignableUsers(oid);
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiPatchOrgMember(orgId, userId, role) {
  const oid = String(orgId || "").trim();
  const uid = String(userId || "").trim();
  const nextRole = String(role || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!uid) return { ok: false, status: 0, error: "missing user_id" };
  if (!nextRole) return { ok: false, status: 0, error: "missing role" };
  const endpoint = apiRoutes.orgs.member(oid, uid);
  const r = okOrError(await request(endpoint, { method: "PATCH", body: { role: nextRole } }));
  return r.ok ? { ok: true, status: r.status, item: r.data || {} } : r;
}

export async function apiPatchOrg(orgId, payload = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const body = {
    name: String(payload?.name || "").trim(),
  };
  const endpoint = apiRoutes.orgs.item(oid);
  const r = okOrError(await request(endpoint, { method: "PATCH", body }));
  return r.ok ? { ok: true, status: r.status, org: r.data || {} } : r;
}

function normalizeOrgGitMirrorConfig(raw = {}, orgId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    org_id: String(data.org_id || orgId || "").trim(),
    git_mirror_enabled: data.git_mirror_enabled === true,
    git_provider: String(data.git_provider || "").trim() || null,
    git_repository: String(data.git_repository || "").trim() || null,
    git_branch: String(data.git_branch || "").trim() || null,
    git_base_path: String(data.git_base_path || "").trim() || null,
    git_health_status: String(data.git_health_status || "unknown").trim() || "unknown",
    git_health_message: String(data.git_health_message || "").trim() || null,
    git_updated_at: Number(data.git_updated_at || 0),
    git_updated_by: String(data.git_updated_by || "").trim() || null,
  };
}

export async function apiGetOrgGitMirrorConfig(orgId) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const endpoint = apiRoutes.orgs.gitMirror(oid);
  const r = okOrError(await request(endpoint, { method: "GET" }));
  if (!r.ok) return r;
  const raw = (r.data && typeof r.data === "object" ? r.data.config : null) || {};
  return { ok: true, status: r.status, config: normalizeOrgGitMirrorConfig(raw, oid) };
}

export async function apiPatchOrgGitMirrorConfig(orgId, payload = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const body = {};
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_mirror_enabled")) {
    body.git_mirror_enabled = payload?.git_mirror_enabled === true;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_provider")) {
    body.git_provider = String(payload?.git_provider || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_repository")) {
    body.git_repository = String(payload?.git_repository || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_branch")) {
    body.git_branch = String(payload?.git_branch || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_base_path")) {
    body.git_base_path = String(payload?.git_base_path || "").trim() || null;
  }
  const endpoint = apiRoutes.orgs.gitMirror(oid);
  const r = okOrError(await request(endpoint, { method: "PATCH", body }));
  if (!r.ok) return r;
  const raw = (r.data && typeof r.data === "object" ? r.data.config : null) || {};
  return { ok: true, status: r.status, config: normalizeOrgGitMirrorConfig(raw, oid) };
}

export async function apiValidateOrgGitMirrorConfig(orgId, payload = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const body = {};
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_mirror_enabled")) {
    body.git_mirror_enabled = payload?.git_mirror_enabled === true;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_provider")) {
    body.git_provider = String(payload?.git_provider || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_repository")) {
    body.git_repository = String(payload?.git_repository || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_branch")) {
    body.git_branch = String(payload?.git_branch || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "git_base_path")) {
    body.git_base_path = String(payload?.git_base_path || "").trim() || null;
  }
  const endpoint = apiRoutes.orgs.gitMirrorValidate(oid);
  const r = okOrError(await request(endpoint, { method: "POST", body }));
  if (!r.ok) return r;
  const raw = (r.data && typeof r.data === "object" ? r.data.config : null) || {};
  return { ok: true, status: r.status, config: normalizeOrgGitMirrorConfig(raw, oid) };
}

export async function apiListOrgPropertyDictionaryOperations(orgId, options = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const endpoint = apiRoutes.orgs.propertyDictionaryOperations(oid)
    + (options?.includeInactive ? "?include_inactive=1" : "");
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiUpsertOrgPropertyDictionaryOperation(orgId, payload = {}) {
  const oid = String(orgId || "").trim();
  const operationKey = String(payload?.operation_key || payload?.operationKey || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const body = {
    operation_key: operationKey,
    operation_label: String(payload?.operation_label || payload?.operationLabel || "").trim(),
    is_active: payload?.is_active ?? payload?.isActive ?? true,
    sort_order: Number(payload?.sort_order ?? payload?.sortOrder ?? 0),
  };
  const endpoint = operationKey
    ? apiRoutes.orgs.propertyDictionaryOperation(oid, operationKey)
    : apiRoutes.orgs.propertyDictionaryOperations(oid);
  const method = operationKey ? "PATCH" : "POST";
  const r = okOrError(await request(endpoint, { method, body }));
  return r.ok ? { ok: true, status: r.status, item: r.data?.item || {} } : r;
}

export async function apiGetOrgPropertyDictionaryBundle(orgId, operationKey, options = {}) {
  const oid = String(orgId || "").trim();
  const opKey = String(operationKey || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!opKey) return { ok: false, status: 0, error: "missing operation_key" };
  const endpoint = apiRoutes.orgs.propertyDictionaryOperation(oid, opKey)
    + (options?.includeInactive ? "?include_inactive=1" : "");
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, bundle: r.data || {} } : r;
}

export async function apiUpsertOrgPropertyDictionaryDefinition(orgId, operationKey, payload = {}) {
  const oid = String(orgId || "").trim();
  const opKey = String(operationKey || "").trim();
  const propertyKey = String(payload?.property_key || payload?.propertyKey || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!opKey) return { ok: false, status: 0, error: "missing operation_key" };
  const body = {
    property_key: propertyKey,
    property_label: String(payload?.property_label || payload?.propertyLabel || "").trim(),
    input_mode: String(payload?.input_mode || payload?.inputMode || "autocomplete").trim(),
    allow_custom_value: payload?.allow_custom_value ?? payload?.allowCustomValue ?? true,
    required: payload?.required ?? false,
    is_active: payload?.is_active ?? payload?.isActive ?? true,
    sort_order: Number(payload?.sort_order ?? payload?.sortOrder ?? 0),
  };
  const endpoint = propertyKey
    ? apiRoutes.orgs.propertyDictionaryProperty(oid, opKey, propertyKey)
    : apiRoutes.orgs.propertyDictionaryProperties(oid, opKey);
  const method = propertyKey ? "PATCH" : "POST";
  const r = okOrError(await request(endpoint, { method, body }));
  return r.ok ? { ok: true, status: r.status, item: r.data?.item || {} } : r;
}

export async function apiDeleteOrgPropertyDictionaryDefinition(orgId, operationKey, propertyKey) {
  const oid = String(orgId || "").trim();
  const opKey = String(operationKey || "").trim();
  const propKey = String(propertyKey || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!opKey) return { ok: false, status: 0, error: "missing operation_key" };
  if (!propKey) return { ok: false, status: 0, error: "missing property_key" };
  const r = okOrError(await request(apiRoutes.orgs.propertyDictionaryProperty(oid, opKey, propKey), { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status } : r;
}

export async function apiUpsertOrgPropertyDictionaryValue(orgId, operationKey, propertyKey, payload = {}) {
  const oid = String(orgId || "").trim();
  const opKey = String(operationKey || "").trim();
  const propKey = String(propertyKey || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!opKey) return { ok: false, status: 0, error: "missing operation_key" };
  if (!propKey) return { ok: false, status: 0, error: "missing property_key" };
  const body = {
    option_value: String(payload?.option_value || payload?.optionValue || "").trim(),
    is_active: payload?.is_active ?? payload?.isActive ?? true,
    sort_order: Number(payload?.sort_order ?? payload?.sortOrder ?? 0),
  };
  const r = okOrError(await request(apiRoutes.orgs.propertyDictionaryValues(oid, opKey, propKey), { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, item: r.data?.item || {} } : r;
}

export async function apiPatchOrgPropertyDictionaryValue(orgId, valueId, payload = {}) {
  const oid = String(orgId || "").trim();
  const vid = String(valueId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!vid) return { ok: false, status: 0, error: "missing value_id" };
  const body = {
    option_value: String(payload?.option_value || payload?.optionValue || "").trim(),
    is_active: payload?.is_active ?? payload?.isActive ?? true,
    sort_order: Number(payload?.sort_order ?? payload?.sortOrder ?? 0),
  };
  const r = okOrError(await request(apiRoutes.orgs.propertyDictionaryValue(oid, vid), { method: "PATCH", body }));
  return r.ok ? { ok: true, status: r.status, item: r.data?.item || {} } : r;
}

export async function apiDeleteOrgPropertyDictionaryValue(orgId, valueId) {
  const oid = String(orgId || "").trim();
  const vid = String(valueId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!vid) return { ok: false, status: 0, error: "missing value_id" };
  const r = okOrError(await request(apiRoutes.orgs.propertyDictionaryValue(oid, vid), { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status } : r;
}

export async function apiListOrgInvites(orgId) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  let r = okOrError(await request(apiRoutes.orgs.invites(oid), { method: "GET" }));
  if (!r.ok && Number(r.status || 0) === 404) {
    r = okOrError(await request(apiRoutes.admin.organizationInvites(oid), { method: "GET" }));
  }
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok
    ? {
      ok: true,
      status: r.status,
      items,
      count: Number(r?.data?.count || items.length || 0),
      current_invite: r?.data?.current_invite || null,
    }
    : r;
}

export async function apiCreateOrgInvite(orgId, payload = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const body = {
    email: String(payload?.email || "").trim(),
    full_name: String(payload?.full_name || payload?.fullName || "").trim(),
    job_title: String(payload?.job_title || payload?.jobTitle || "").trim(),
    role: String(payload?.role || "viewer").trim() || "viewer",
    ttl_days: Number(payload?.ttl_days || payload?.ttlDays || 7),
    regenerate: payload?.regenerate === true,
  };
  let r = okOrError(await request(apiRoutes.orgs.invites(oid), { method: "POST", body }));
  if (!r.ok && Number(r.status || 0) === 404) {
    r = okOrError(await request(apiRoutes.admin.organizationInvites(oid), { method: "POST", body }));
  }
  return r.ok
    ? {
      ok: true,
      status: r.status,
      invite: r.data?.invite || {},
      invite_key: r.data?.invite_key || r.data?.invite_token || "",
      invite_token: r.data?.invite_token || r.data?.invite_key || "",
      invite_link: r.data?.invite_link || "",
      delivery: String(r.data?.delivery || ""),
    }
    : r;
}

export async function apiAcceptInviteToken(token) {
  const inviteToken = String(token || "").trim();
  if (!inviteToken) return { ok: false, status: 0, error: "missing token" };
  const r = okOrError(await request(apiRoutes.misc.inviteAccept(), { method: "POST", body: { token: inviteToken } }));
  return r.ok ? { ok: true, status: r.status, invite: r.data?.invite || {}, membership: r.data?.membership || {} } : r;
}

export async function apiRevokeOrgInvite(orgId, inviteId) {
  const oid = String(orgId || "").trim();
  const iid = String(inviteId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!iid) return { ok: false, status: 0, error: "missing invite_id" };
  let r = okOrError(await request(apiRoutes.orgs.inviteRevoke(oid, iid), { method: "POST" }));
  if (!r.ok && Number(r.status || 0) === 404) {
    r = okOrError(await request(apiRoutes.admin.organizationInviteRevoke(oid, iid), { method: "POST" }));
  }
  return r.ok ? { ok: true, status: r.status } : r;
}

export async function apiCleanupOrgInvites(orgId, keepDays) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const n = Number(keepDays || 0);
  const endpoint = apiRoutes.orgs.invitesCleanup(
    oid,
    Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "",
  );
  const r = okOrError(await request(endpoint, { method: "POST" }));
  return r.ok ? { ok: true, status: r.status, deleted: Number(r.data?.deleted || 0) } : r;
}

export async function apiListOrgAudit(orgId, query = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const params = new URLSearchParams();
  const limit = Number(query?.limit || 100);
  if (Number.isFinite(limit) && limit > 0) params.set("limit", String(Math.min(500, Math.max(1, Math.round(limit)))));
  const action = String(query?.action || "").trim();
  const projectId = String(query?.project_id || query?.projectId || "").trim();
  const sessionId = String(query?.session_id || query?.sessionId || "").trim();
  const status = String(query?.status || "").trim();
  if (action) params.set("action", action);
  if (projectId) params.set("project_id", projectId);
  if (sessionId) params.set("session_id", sessionId);
  if (status) params.set("status", status);
  const endpoint = apiRoutes.orgs.audit(oid) + (params.toString() ? `?${params.toString()}` : "");
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiCleanupOrgAudit(orgId, retentionDays) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const n = Number(retentionDays || 0);
  const endpoint = apiRoutes.orgs.auditCleanup(
    oid,
    Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "",
  );
  const r = okOrError(await request(endpoint, { method: "POST" }));
  return r.ok ? { ok: true, status: r.status, deleted: Number(r.data?.deleted || 0) } : r;
}

export async function apiGetEnterpriseWorkspace(options = {}) {
  const explicitOrgId = String(options?.orgId || "").trim();
  const active = String(getActiveOrgId() || "").trim();
  const oid = explicitOrgId || active;
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const params = new URLSearchParams();
  const groupBy = String(options?.groupBy || "").trim().toLowerCase();
  if (groupBy === "users" || groupBy === "projects") params.set("group_by", groupBy);
  const q = String(options?.q || "").trim();
  if (q) params.set("q", q);
  const ownerIds = Array.isArray(options?.ownerIds)
    ? options.ownerIds
    : String(options?.ownerIds || "").split(",");
  const ownerList = ownerIds
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (ownerList.length) params.set("owner_ids", ownerList.join(","));
  const projectId = String(options?.projectId || "").trim();
  if (projectId) params.set("project_id", projectId);
  const status = String(options?.status || "").trim().toLowerCase();
  if (status) params.set("status", status);
  const updatedFrom = Number(options?.updatedFrom || 0);
  if (Number.isFinite(updatedFrom) && updatedFrom > 0) params.set("updated_from", String(Math.round(updatedFrom)));
  const updatedTo = Number(options?.updatedTo || 0);
  if (Number.isFinite(updatedTo) && updatedTo > 0) params.set("updated_to", String(Math.round(updatedTo)));
  if (options?.needsAttention === true || options?.needsAttention === 1) params.set("needs_attention", "1");
  if (options?.needsAttention === false || options?.needsAttention === 0) params.set("needs_attention", "0");
  const limit = Number(options?.limit || 50);
  if (Number.isFinite(limit) && limit > 0) params.set("limit", String(Math.min(200, Math.max(1, Math.round(limit)))));
  const offset = Number(options?.offset || 0);
  if (Number.isFinite(offset) && offset >= 0) params.set("offset", String(Math.max(0, Math.round(offset))));
  const endpoint = apiRoutes.enterprise.workspace(Object.fromEntries(params.entries()));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  if (!r.ok) return r;
  const data = isPlainObject(r.data) ? r.data : {};
  return {
    ok: true,
    status: r.status,
    org: isPlainObject(data.org) ? data.org : {},
    group_by: String(data.group_by || groupBy || "users"),
    summary: isPlainObject(data.summary) ? data.summary : {},
    users: Array.isArray(data.users) ? data.users : [],
    projects: Array.isArray(data.projects) ? data.projects : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    page: isPlainObject(data.page) ? data.page : { limit: 50, offset: 0, total: 0 },
  };
}
