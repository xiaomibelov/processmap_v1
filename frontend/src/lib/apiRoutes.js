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
    assignableUsers: (orgId) => `/api/orgs/${encode(orgId)}/assignable-users`,
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
    projectSessions: (orgId, projectId, mode = "", view = "") => {
      const path = `/api/orgs/${encode(orgId)}/projects/${encode(projectId)}/sessions`;
      return withQuery(path, { mode: String(mode || "").trim(), view: String(view || "").trim() });
    },
    gitMirror: (orgId) => `/api/orgs/${encode(orgId)}/git-mirror`,
    gitMirrorValidate: (orgId) => `/api/orgs/${encode(orgId)}/git-mirror/validate`,
    groups: (orgId) => `/api/orgs/${encode(orgId)}/groups`,
    group: (orgId, groupId) => `/api/orgs/${encode(orgId)}/groups/${encode(groupId)}`,
    groupMembers: (orgId, groupId) => `/api/orgs/${encode(orgId)}/groups/${encode(groupId)}/members`,
    groupMember: (orgId, groupId, userId) => `/api/orgs/${encode(orgId)}/groups/${encode(groupId)}/members/${encode(userId)}`,
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
    sessions: (projectId, mode = "", view = "") => {
      const path = `/api/projects/${encode(projectId)}/sessions`;
      return withQuery(path, { mode: String(mode || "").trim(), view: String(view || "").trim() });
    },
    analytics: (projectId) => `/api/projects/${encode(projectId)}/analytics`,
  },
  workspaces: {
    analytics: (workspaceId) => `/api/workspaces/${encode(workspaceId)}/analytics`,
  },
  analysis: {
    productActionsRegistryQuery: () => "/api/analysis/product-actions/registry/query",
    productActionsRegistryExportCsv: () => "/api/analysis/product-actions/registry/export.csv",
    productActionsRegistryExportXlsx: () => "/api/analysis/product-actions/registry/export.xlsx",
    processPropertiesRegistryQuery: () => "/api/analysis/properties/registry/query",
    processPropertiesRegistryExportCsv: () => "/api/analysis/properties/registry/export.csv",
    processPropertiesRegistryExportXlsx: () => "/api/analysis/properties/registry/export.xlsx",
    processPropertyRegistryQuery: () => "/api/analysis/properties/registry/query",
    processPropertyRegistryExport: () => "/api/analysis/properties/registry/export",
    referenceOptions: (source) => `/api/reference/${encodeURIComponent(source)}/options`,
    productActionsBulkSuggest: () => "/api/analysis/product-actions/suggest-bulk",
  },
  sessions: {
    list: () => "/api/sessions",
    create: () => "/api/sessions",
    item: (sessionId) => `/api/sessions/${encode(sessionId)}`,
    status: (sessionId) => `/api/sessions/${encode(sessionId)}/status`,
    meta: (sessionId) => `/api/sessions/${encode(sessionId)}/meta`,
    properties: (sessionId) => `/api/sessions/${encode(sessionId)}/properties`,
    graph: (sessionId) => `/api/sessions/${encode(sessionId)}/graph`,
    presence: (sessionId) => `/api/sessions/${encode(sessionId)}/presence`,
    nodes: (sessionId) => `/api/sessions/${encode(sessionId)}/nodes`,
    node: (sessionId, nodeId) => `/api/sessions/${encode(sessionId)}/nodes/${encode(nodeId)}`,
    edges: (sessionId) => `/api/sessions/${encode(sessionId)}/edges`,
    notes: (sessionId) => `/api/sessions/${encode(sessionId)}/notes`,
    notesExtractionPreview: (sessionId) => `/api/sessions/${encode(sessionId)}/notes/extraction-preview`,
    notesExtractionApply: (sessionId) => `/api/sessions/${encode(sessionId)}/notes/extraction-apply`,
    productActionsSuggest: (sessionId) => `/api/sessions/${encode(sessionId)}/analysis/product-actions/suggest`,
    productActionsBatchSuggest: (sessionId) => `/api/sessions/${encode(sessionId)}/analysis/product-actions/batch-suggest`,
    productActionsBatchDraft: (sessionId) => `/api/sessions/${encode(sessionId)}/analysis/product-actions/batch-draft`,
    analysisViewModel: (sessionId) => `/api/sessions/${encode(sessionId)}/analysis/view-model`,
    noteAggregate: (sessionId) => `/api/sessions/${encode(sessionId)}/note-aggregate`,
    mentionableUsers: (sessionId) => `/api/sessions/${encode(sessionId)}/mentionable-users`,
    noteThreads: (sessionId, filters = {}) => withQuery(`/api/sessions/${encode(sessionId)}/note-threads`, {
      status: String(filters?.status || "").trim(),
      scope_type: String(filters?.scopeType || filters?.scope_type || "").trim(),
      element_id: String(filters?.elementId || filters?.element_id || "").trim(),
    }),
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
      offset: String(options?.offset || "").trim(),
      include_technical: options?.includeTechnical === true ? "1" : "",
      include_xml: options?.includeXml === true ? "1" : "",
    }),
    bpmnVersion: (sessionId, versionId) => `/api/sessions/${encode(sessionId)}/bpmn/versions/${encode(versionId)}`,
    bpmnRestore: (sessionId, versionId) => `/api/sessions/${encode(sessionId)}/bpmn/restore/${encode(versionId)}`,
    bpmnMeta: (sessionId) => `/api/sessions/${encode(sessionId)}/bpmn_meta`,
    overlays: (sessionId) => `/api/sessions/${encode(sessionId)}/overlays`,
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
    subprocessNavigate: (sessionId, elementId, targetElementId = "") => withQuery(
      `/api/sessions/${encode(sessionId)}/subprocess/${encode(elementId)}/navigate`,
      { target_element_id: String(targetElementId || "").trim() }
    ),
    subprocessReturn: (sessionId) => `/api/sessions/${encode(sessionId)}/return`,
  },
  clipboard: {
    bpmn: () => "/api/clipboard/bpmn",
    bpmnCopy: () => "/api/clipboard/bpmn/copy",
    bpmnPaste: () => "/api/clipboard/bpmn/paste",
  },
  reports: {
    item: (reportId) => `/api/reports/${encode(reportId)}`,
  },
  noteThreads: {
    item: (threadId) => `/api/note-threads/${encode(threadId)}`,
    comments: (threadId) => `/api/note-threads/${encode(threadId)}/comments`,
    attentionAcknowledgement: (threadId) => `/api/note-threads/${encode(threadId)}/attention-acknowledgement`,
    read: (threadId) => `/api/note-threads/${encode(threadId)}/read`,
  },
  noteComments: {
    item: (commentId) => `/api/note-comments/${encode(commentId)}`,
  },
  noteMentions: {
    list: (limit = "") => withQuery("/api/note-mentions", { limit: String(limit || "").trim() }),
    acknowledge: (mentionId) => `/api/note-mentions/${encode(mentionId)}/acknowledge`,
  },
  noteNotifications: {
    list: ({ limit = "", includeRead = false } = {}) => withQuery("/api/note-notifications", {
      limit: String(limit || "").trim(),
      include_read: includeRead === true ? "1" : "",
    }),
  },
  noteAggregates: {
    sessions: () => "/api/sessions/note-aggregates",
    project: (projectId) => `/api/projects/${encode(projectId)}/note-aggregate`,
    folder: (folderId, workspaceId) => withQuery(`/api/folders/${encode(folderId)}/note-aggregate`, {
      workspace_id: String(workspaceId || "").trim(),
    }),
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
    orgStatus: (orgId) => `/api/admin/orgs/${encodeURIComponent(String(orgId || ""))}/status`,
    users: () => "/api/admin/users",
    user: (userId) => `/api/admin/users/${encode(userId)}`,
    organizationInvites: (orgId) => `/api/admin/organizations/${encode(orgId)}/invites`,
    organizationInviteRevoke: (orgId, inviteId) => `/api/admin/organizations/${encode(orgId)}/invites/${encode(inviteId)}/revoke`,
    projects: (params = {}) => withQuery("/api/admin/projects", params),
    sessions: (params = {}) => withQuery("/api/admin/sessions", params),
    session: (sessionId) => `/api/admin/sessions/${encode(sessionId)}`,
    jobs: () => "/api/admin/jobs",
    audit: (params = {}) => withQuery("/api/admin/audit", params),
    errorEvents: (params = {}) => withQuery("/api/admin/error-events", params),
    errorEvent: (eventId) => `/api/admin/error-events/${encode(eventId)}`,
    aiModules: () => "/api/admin/ai/modules",
    aiProviderSettings: () => "/api/admin/ai/provider-settings",
    aiProviderVerify: () => "/api/admin/ai/provider-settings/verify",
    aiExecutions: (params = {}) => withQuery("/api/admin/ai/executions", params),
    aiPrompts: (params = {}) => withQuery("/api/admin/ai/prompts", params),
    aiPromptActive: (params = {}) => withQuery("/api/admin/ai/prompts/active", params),
    aiPrompt: (promptId) => `/api/admin/ai/prompts/${encode(promptId)}`,
    aiPromptActivate: (promptId) => `/api/admin/ai/prompts/${encode(promptId)}/activate`,
    aiPromptArchive: (promptId) => `/api/admin/ai/prompts/${encode(promptId)}/archive`,
    ragSettings: () => "/api/admin/rag/settings",
    ragPatchSettings: () => "/api/admin/rag/settings",
    featureFlags: () => "/api/admin/feature-flags",
    featureFlagsPatch: () => "/api/admin/feature-flags",
    agentRuns: () => "/api/admin/agent-runs",
    agentRun: (runId) => `/api/admin/agent-runs/${encodeURIComponent(String(runId || ""))}`,
    permissions: (params = {}) => withQuery("/api/admin/permissions", params),
    permissionEntities: (params = {}) => withQuery("/api/admin/permissions/entities", params),
    permission: (entityType, entityId) => `/api/admin/permissions/${encodeURIComponent(String(entityType || ""))}/${encodeURIComponent(String(entityId || ""))}`,
    permissionsBulk: () => "/api/admin/permissions/bulk",
    permissionsMatrix: (params = {}) => withQuery("/api/admin/permissions/matrix", params),
    permissionsMatrixItem: (principalType, principalId, entityType, entityId) =>
      `/api/admin/permissions/matrix/${encodeURIComponent(String(principalType || ""))}/${encodeURIComponent(String(principalId || ""))}/${encodeURIComponent(String(entityType || ""))}/${encodeURIComponent(String(entityId || ""))}`,
    permissionsMatrixBulk: () => "/api/admin/permissions/matrix/bulk",
    permissionPrincipals: () => "/api/admin/permissions/principals",
    invitePermissions: (inviteId) => `/api/admin/invites/${encodeURIComponent(String(inviteId || ""))}/permissions`,
    deploymentNotices: () => "/api/admin/deployment-notices",
    deploymentNotice: (noticeId) => `/api/admin/deployment-notices/${encodeURIComponent(String(noticeId || ""))}`,
  },
  featureFlags: {
    get: () => "/api/feature-flags",
  },
  rag: {
    search: (params = {}) => withQuery("/api/rag/search", {
      q: String(params?.q || "").trim(),
      top_k: params?.top_k ? String(params.top_k) : "",
      source_type: String(params?.source_type || "").trim(),
      session_id: String(params?.session_id || "").trim(),
      min_score: params?.min_score != null ? String(params.min_score) : "",
    }),
    index: () => "/api/rag/index",
    productActionsIndex: () => "/api/rag/product-actions/index",
  },
  misc: {
    deploymentNotice: () => "/api/deployment-notice",
    meta: () => "/api/meta",
    glossaryAdd: () => "/api/glossary/add",
    inviteAccept: () => "/api/invites/accept",
    telemetryErrorEvents: () => "/api/telemetry/error-events",
  },
  analytics: {
    dashboard: (scope, scopeId) => `/api/analytics/dashboard?scope=${encode(scope)}&scope_id=${encode(scopeId)}`,
    dashboardByPath: (scope, scopeId) => `/api/analytics/${encode(scope)}/${encode(scopeId)}/dashboard`,
    properties: (scope, scopeId, params = {}) => withQuery("/api/analytics/properties", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
      page: params.page != null ? String(params.page) : "",
      limit: params.limit != null ? String(params.limit) : "",
      type_filter: (params.type_filter || []).join(","),
      category_filter: (params.category_filter || []).join(","),
      source_filter: (params.source_filter || []).join(","),
      section_filter: (params.section_filter || []).join(","),
      role_filter: (params.role_filter || []).join(","),
    }),
    actions: (scope, scopeId, params = {}) => withQuery("/api/analytics/actions", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
      page: params.page != null ? String(params.page) : "",
      limit: params.limit != null ? String(params.limit) : "",
      section_filter: (params.section_filter || []).join(","),
      role_filter: (params.role_filter || []).join(","),
      type_filter: (params.type_filter || []).join(","),
    }),
    propertiesSummary: (scope, scopeId, params = {}) => withQuery("/api/analytics/properties/summary", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
      type_filter: (params.type_filter || []).join(","),
      category_filter: (params.category_filter || []).join(","),
      source_filter: (params.source_filter || []).join(","),
    }),
    actionsSummary: (scope, scopeId, params = {}) => withQuery("/api/analytics/actions/summary", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
      section_filter: (params.section_filter || []).join(","),
      role_filter: (params.role_filter || []).join(","),
      type_filter: (params.type_filter || []).join(","),
    }),
    exportPropertiesCsv: (scope, scopeId) => withQuery("/api/analytics/properties/export.csv", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
    }),
    exportActionsCsv: (scope, scopeId) => withQuery("/api/analytics/actions/export.csv", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
    }),
    exportPropertiesXlsx: (scope, scopeId) => withQuery("/api/analytics/properties/export.xlsx", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
    }),
    exportPropertiesRecalculatedXlsx: (scope, scopeId) => withQuery("/api/analytics/properties/export-recalculated.xlsx", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
    }),
    propertiesRecalculation: (scope, scopeId) => withQuery("/api/analytics/properties/recalculation", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
    }),
    exportActionsXlsx: (scope, scopeId) => withQuery("/api/analytics/actions/export.xlsx", {
      scope: String(scope || "").trim(),
      scope_id: String(scopeId || "").trim(),
    }),
  },
  recipes: {
    list: () => "/api/recipes",
    create: () => "/api/recipes",
    item: (id) => `/api/recipes/${encode(id)}`,
    calculate: (id) => `/api/recipes/${encode(id)}/calculate`,
  },
  ingredients: {
    list: () => "/api/ingredients",
    create: () => "/api/ingredients",
  },
};

export default apiRoutes;
