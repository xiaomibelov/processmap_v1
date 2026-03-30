function encode(value) {
  return encodeURIComponent(String(value || "").trim());
}

function withQuery(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    search.set(String(key), text);
  });
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export const apiRoutes = {
  auth: {
    login: () => "/api/auth/login",
    logout: () => "/api/auth/logout",
    me: () => "/api/auth/me",
    refresh: () => "/api/auth/refresh",
    invitePreview: () => "/api/invite/resolve",
    inviteActivate: () => "/api/invite/activate",
  },
  invite: {
    resolve: () => "/api/invite/resolve",
    activate: () => "/api/invite/activate",
  },
  orgs: {
    list: () => "/api/orgs",
    item: (orgId) => `/api/orgs/${encode(orgId)}`,
    members: (orgId) => `/api/orgs/${encode(orgId)}/members`,
    member: (orgId, userId) => `/api/orgs/${encode(orgId)}/members/${encode(userId)}`,
    memberAssign: (orgId) => `/api/orgs/${encode(orgId)}/members/assign`,
    propertyDictionaryOperations: (orgId) => `/api/orgs/${encode(orgId)}/property-dictionary/operations`,
    propertyDictionaryOperation: (orgId, operationKey) => `/api/orgs/${encode(orgId)}/property-dictionary/operations/${encode(operationKey)}`,
    propertyDictionaryProperties: (orgId, operationKey) => `/api/orgs/${encode(orgId)}/property-dictionary/operations/${encode(operationKey)}/properties`,
    propertyDictionaryProperty: (orgId, operationKey, propertyKey) => `/api/orgs/${encode(orgId)}/property-dictionary/operations/${encode(operationKey)}/properties/${encode(propertyKey)}`,
    propertyDictionaryValues: (orgId, operationKey, propertyKey) => `/api/orgs/${encode(orgId)}/property-dictionary/operations/${encode(operationKey)}/properties/${encode(propertyKey)}/values`,
    propertyDictionaryValue: (orgId, valueId) => `/api/orgs/${encode(orgId)}/property-dictionary/values/${encode(valueId)}`,
    invites: (orgId) => `/api/orgs/${encode(orgId)}/invites`,
    inviteRevoke: (orgId, inviteId) => `/api/orgs/${encode(orgId)}/invites/${encode(inviteId)}/revoke`,
    invitesCleanup: (orgId, keepDays = "") => withQuery(`/api/orgs/${encode(orgId)}/invites/cleanup`, {
      keep_days: String(keepDays || "").trim(),
    }),
    inviteResend: (orgId, inviteId) => `/api/orgs/${encode(orgId)}/invites/${encode(inviteId)}/resend`,
    inviteCancel: (orgId, inviteId) => `/api/orgs/${encode(orgId)}/invites/${encode(inviteId)}`,
    audit: (orgId) => `/api/orgs/${encode(orgId)}/audit`,
    auditCleanup: (orgId, retentionDays = "") => withQuery(`/api/orgs/${encode(orgId)}/audit/cleanup`, {
      retention_days: String(retentionDays || "").trim(),
    }),
    projects: (orgId) => `/api/orgs/${encode(orgId)}/projects`,
    projectMembers: (orgId, projectId) => `/api/orgs/${encode(orgId)}/projects/${encode(projectId)}/members`,
    projectMember: (orgId, projectId, userId) => `/api/orgs/${encode(orgId)}/projects/${encode(projectId)}/members/${encode(userId)}`,
    projectSessions: (orgId, projectId, mode = "") => {
      const path = `/api/orgs/${encode(orgId)}/projects/${encode(projectId)}/sessions`;
      return withQuery(path, { mode: String(mode || "").trim() });
    },
    gitMirror: (orgId) => `/api/orgs/${encode(orgId)}/git-mirror`,
    gitMirrorValidate: (orgId) => `/api/orgs/${encode(orgId)}/git-mirror/validate`,
    reportBuild: (orgId, sessionId) => `/api/orgs/${encode(orgId)}/sessions/${encode(sessionId)}/reports/build`,
    reportVersions: (orgId, sessionId, pathId = "", stepsHash = "") => withQuery(
      `/api/orgs/${encode(orgId)}/sessions/${encode(sessionId)}/reports/versions`,
      { path_id: pathId, steps_hash: stepsHash },
    ),
    reportVersion: (orgId, sessionId, reportId, pathId = "", stepsHash = "") => withQuery(
      `/api/orgs/${encode(orgId)}/sessions/${encode(sessionId)}/reports/${encode(reportId)}`,
      { path_id: pathId, steps_hash: stepsHash },
    ),
  },
  templates: {
    listMy: () => "/api/templates?scope=personal",
    listOrg: (orgId) => withQuery("/api/templates", { scope: "org", org_id: String(orgId || "").trim() }),
    list: (scope = "personal", orgId = "") => withQuery("/api/templates", {
      scope: String(scope || "personal").trim(),
      org_id: String(orgId || "").trim(),
    }),
    create: () => "/api/templates",
    item: (id) => `/api/templates/${encode(id)}`,
  },
  templateFolders: {
    list: (scope = "personal", orgId = "") => withQuery("/api/template-folders", {
      scope: String(scope || "personal").trim(),
      org_id: String(orgId || "").trim(),
    }),
    create: () => "/api/template-folders",
    item: (id) => `/api/template-folders/${encode(id)}`,
  },
  projects: {
    list: () => "/api/projects",
    create: () => "/api/projects",
    item: (projectId) => `/api/projects/${encode(projectId)}`,
    sessions: (projectId, mode = "") => {
      const path = `/api/projects/${encode(projectId)}/sessions`;
      return withQuery(path, { mode: String(mode || "").trim() });
    },
  },
  sessions: {
    list: () => "/api/sessions",
    create: () => "/api/sessions",
    item: (sessionId) => `/api/sessions/${encode(sessionId)}`,
    nodes: (sessionId) => `/api/sessions/${encode(sessionId)}/nodes`,
    node: (sessionId, nodeId) => `/api/sessions/${encode(sessionId)}/nodes/${encode(nodeId)}`,
    edges: (sessionId) => `/api/sessions/${encode(sessionId)}/edges`,
    notes: (sessionId) => `/api/sessions/${encode(sessionId)}/notes`,
    answer: (sessionId) => `/api/sessions/${encode(sessionId)}/answer`,
    answers: (sessionId) => `/api/sessions/${encode(sessionId)}/answers`,
    aiQuestions: (sessionId) => `/api/sessions/${encode(sessionId)}/ai/questions`,
    recompute: (sessionId) => `/api/sessions/${encode(sessionId)}/recompute`,
    analytics: (sessionId) => `/api/sessions/${encode(sessionId)}/analytics`,
    export: (sessionId) => `/api/sessions/${encode(sessionId)}/export`,
    bpmn: (sessionId, options = {}) => withQuery(`/api/sessions/${encode(sessionId)}/bpmn`, {
      raw: options?.raw === true ? "1" : "",
      include_overlay: options?.includeOverlay === false ? "0" : "",
      _ts: options?.cacheBust === true ? String(Date.now()) : "",
    }),
    bpmnVersions: (sessionId, options = {}) => withQuery(`/api/sessions/${encode(sessionId)}/bpmn/versions`, {
      limit: String(options?.limit || "").trim(),
      include_xml: options?.includeXml === true ? "1" : "",
    }),
    bpmnRestore: (sessionId, versionId) => `/api/sessions/${encode(sessionId)}/bpmn/restore/${encode(versionId)}`,
    bpmnMeta: (sessionId) => `/api/sessions/${encode(sessionId)}/bpmn_meta`,
    inferRtiers: (sessionId) => `/api/sessions/${encode(sessionId)}/bpmn_meta/infer_rtiers`,
    autoPass: (sessionId, options = {}) => withQuery(`/api/sessions/${encode(sessionId)}/auto-pass`, {
      job_id: String(options?.job_id || options?.jobId || "").trim(),
    }),
    autoPassPrecheck: (sessionId) => `/api/sessions/${encode(sessionId)}/auto-pass/precheck`,
    pathReports: (sessionId, pathId, stepsHash = "") => withQuery(
      `/api/sessions/${encode(sessionId)}/paths/${encode(pathId)}/reports`,
      { steps_hash: String(stepsHash || "").trim() },
    ),
    pathReport: (sessionId, pathId, reportId) => `/api/sessions/${encode(sessionId)}/paths/${encode(pathId)}/reports/${encode(reportId)}`,
  },
  reports: {
    item: (reportId) => `/api/reports/${encode(reportId)}`,
  },
  llm: {
    sessionTitleQuestions: () => "/api/llm/session-title/questions",
    settings: () => "/api/settings/llm",
    verify: () => "/api/settings/llm/verify",
  },
  enterprise: {
    workspace: (params = {}) => withQuery("/api/enterprise/workspace", params),
  },
  admin: {
    dashboard: (params = {}) => withQuery("/api/admin/dashboard", params),
    orgs: () => "/api/admin/orgs",
    users: () => "/api/admin/users",
    user: (userId) => `/api/admin/users/${encode(userId)}`,
    organizationInvites: (orgId) => `/api/admin/organizations/${encode(orgId)}/invites`,
    organizationInviteRevoke: (orgId, inviteId) => `/api/admin/organizations/${encode(orgId)}/invites/${encode(inviteId)}/revoke`,
    projects: (params = {}) => withQuery("/api/admin/projects", params),
    sessions: (params = {}) => withQuery("/api/admin/sessions", params),
    session: (sessionId) => `/api/admin/sessions/${encode(sessionId)}`,
    jobs: () => "/api/admin/jobs",
    audit: (params = {}) => withQuery("/api/admin/audit", params),
  },
  misc: {
    meta: () => "/api/meta",
    glossaryAdd: () => "/api/glossary/add",
    inviteAccept: () => "/api/invites/accept",
  },
};

export default apiRoutes;
