import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_API_BASE = String(process.env.E2E_API_BASE_URL || "http://127.0.0.1:18011").trim();
const DEFAULT_PATH_ID = String(process.env.E2E_PATH_ID || "primary").trim() || "primary";

function toText(value) {
  return String(value || "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function shellEscape(value) {
  const src = String(value == null ? "" : value);
  return `'${src.replace(/'/g, `'\\''`)}'`;
}

function buildHeaders(token, orgId = "", extra = {}) {
  const out = {
    Accept: "application/json",
    Authorization: `Bearer ${toText(token)}`,
    ...extra,
  };
  const oid = toText(orgId || process.env.E2E_ORG_ID || "");
  if (oid) out["X-Org-Id"] = oid;
  return out;
}

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function requestJson(url, { method = "GET", headers = {}, body } = {}) {
  const init = {
    method,
    headers,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = {
      "Content-Type": "application/json",
      ...headers,
    };
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const data = parseJsonSafe(text);
  return {
    ok: res.ok,
    status: Number(res.status || 0),
    text,
    data,
  };
}

async function apiLogin({ baseURL, email, password }) {
  const endpoint = `${toText(baseURL)}/api/auth/login`;
  const payload = { email: toText(email), password: String(password || "") };
  const res = await requestJson(endpoint, { method: "POST", body: payload, headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`[E2E_BOOTSTRAP] login_failed status=${res.status} endpoint=${endpoint} detail=${res.text}`);
  }
  const token = toText(res.data?.access_token);
  if (!token) {
    throw new Error(`[E2E_BOOTSTRAP] login_missing_token status=${res.status} endpoint=${endpoint}`);
  }
  return token;
}

async function resolveOrg({ baseURL, token, requestedOrgId = "" }) {
  const meRes = await requestJson(`${toText(baseURL)}/api/auth/me`, {
    method: "GET",
    headers: buildHeaders(token, ""),
  });
  if (!meRes.ok) {
    throw new Error(`[E2E_BOOTSTRAP] auth_me_failed status=${meRes.status}`);
  }
  let orgs = Array.isArray(meRes.data?.orgs) ? meRes.data.orgs : [];
  if (!orgs.length) {
    const listRes = await requestJson(`${toText(baseURL)}/api/orgs`, {
      method: "GET",
      headers: buildHeaders(token, ""),
    });
    const listed = Array.isArray(listRes.data?.items) ? listRes.data.items : [];
    if (listed.length) orgs = listed;
  }
  const requested = toText(requestedOrgId || process.env.E2E_ORG_ID || "");
  const active = toText(meRes.data?.active_org_id || meRes.data?.default_org_id || "");
  const first = toText(orgs[0]?.org_id || orgs[0]?.id || "");
  let orgId = "";
  if (requested && orgs.some((row) => toText(row?.org_id || row?.id || "") === requested)) orgId = requested;
  if (!orgId) orgId = active || first;
  if (!orgId && Boolean(meRes.data?.is_admin)) {
    const createRes = await requestJson(`${toText(baseURL)}/api/orgs`, {
      method: "POST",
      headers: buildHeaders(token, ""),
      body: { name: `E2E Org ${Date.now()}` },
    });
    if (createRes.ok) {
      orgId = toText(createRes.data?.id || createRes.data?.org_id || "");
      if (orgId) {
        orgs = [...orgs, { org_id: orgId, id: orgId, name: toText(createRes.data?.name || orgId), role: "org_owner" }];
      }
    }
  }
  if (!orgId) {
    throw new Error("[E2E_BOOTSTRAP] no_org_available_for_user");
  }
  return { orgId, me: meRes.data || {} };
}

async function getSession({ baseURL, token, sessionId, orgId }) {
  const sid = toText(sessionId);
  if (!sid) return { ok: false, status: 0, data: {} };
  return requestJson(`${toText(baseURL)}/api/sessions/${encodeURIComponent(sid)}`, {
    method: "GET",
    headers: buildHeaders(token, orgId),
  });
}

async function listReportVersions({ baseURL, token, sessionId, pathId, orgId }) {
  const endpoint = `${toText(baseURL)}/api/orgs/${encodeURIComponent(toText(orgId))}/sessions/${encodeURIComponent(toText(sessionId))}/reports/versions?path_id=${encodeURIComponent(toText(pathId))}`;
  const res = await requestJson(endpoint, {
    method: "GET",
    headers: buildHeaders(token, orgId),
  });
  if (!res.ok) return [];
  return Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
}

async function ensureReportSeed({ baseURL, token, orgId, sessionId, pathId }) {
  const existing = await listReportVersions({ baseURL, token, sessionId, pathId, orgId });
  if (existing.length > 0) return { created: false, reportId: toText(existing[0]?.id) };

  const buildEndpoint = `${toText(baseURL)}/api/orgs/${encodeURIComponent(toText(orgId))}/sessions/${encodeURIComponent(toText(sessionId))}/reports/build`;
  const payload = {
    path_id: toText(pathId),
    steps_hash: `e2e_seed_${Date.now()}`,
    prompt_template_version: "v2",
    request_payload_json: {
      scenario_label: "E2E enterprise",
      steps: [{ order_index: 1, bpmn_id: "Task_E2E", name: "E2E generated step", work_sec: 30, wait_sec: 0 }],
    },
  };
  const buildRes = await requestJson(buildEndpoint, {
    method: "POST",
    headers: buildHeaders(token, orgId),
    body: payload,
  });
  if (!buildRes.ok) {
    throw new Error(`[E2E_BOOTSTRAP] report_build_failed status=${buildRes.status} detail=${buildRes.text}`);
  }

  for (let i = 0; i < 20; i += 1) {
    const rows = await listReportVersions({ baseURL, token, sessionId, pathId, orgId });
    if (rows.length > 0) return { created: true, reportId: toText(rows[0]?.id) };
    await sleep(250);
  }
  throw new Error("[E2E_BOOTSTRAP] report_seed_not_visible_after_build");
}

async function createEnterpriseProject({ baseURL, token, orgId, title }) {
  const endpoint = `${toText(baseURL)}/api/orgs/${encodeURIComponent(toText(orgId))}/projects`;
  const payload = {
    title: toText(title) || `E2E Enterprise ${Date.now()}`,
    passport: { source: "enterprise_e2e_bootstrap", created_at: Date.now() },
  };
  const res = await requestJson(endpoint, {
    method: "POST",
    headers: buildHeaders(token, orgId),
    body: payload,
  });
  if (!res.ok) {
    throw new Error(`[E2E_BOOTSTRAP] create_project_failed status=${res.status} detail=${res.text}`);
  }
  const projectId = toText(res.data?.id || res.data?.project_id || res.data?.projectId);
  if (!projectId) {
    throw new Error("[E2E_BOOTSTRAP] create_project_missing_id");
  }
  return { projectId, project: res.data || {} };
}

async function createEnterpriseSession({ baseURL, token, orgId, projectId, title }) {
  const endpoint = `${toText(baseURL)}/api/orgs/${encodeURIComponent(toText(orgId))}/projects/${encodeURIComponent(toText(projectId))}/sessions?mode=quick_skeleton`;
  const payload = {
    title: toText(title) || `E2E Session ${Date.now()}`,
    roles: ["operator"],
    start_role: "operator",
  };
  const res = await requestJson(endpoint, {
    method: "POST",
    headers: buildHeaders(token, orgId),
    body: payload,
  });
  if (!res.ok) {
    throw new Error(`[E2E_BOOTSTRAP] create_session_failed status=${res.status} detail=${res.text}`);
  }
  const sessionId = toText(res.data?.id || res.data?.session_id || res.data?.sessionId);
  if (!sessionId) {
    throw new Error("[E2E_BOOTSTRAP] create_session_missing_id");
  }
  return { sessionId, session: res.data || {} };
}

export async function ensureEnterpriseSession({ baseURL, token, orgId } = {}) {
  const resolvedBase = toText(baseURL || DEFAULT_API_BASE);
  const pathId = toText(process.env.E2E_PATH_ID || DEFAULT_PATH_ID) || "primary";
  const email = toText(process.env.E2E_USER || process.env.E2E_ADMIN_EMAIL || "admin@local");
  const password = String(process.env.E2E_PASS || process.env.E2E_ADMIN_PASSWORD || "admin");
  const accessToken = toText(token) || await apiLogin({ baseURL: resolvedBase, email, password });
  const orgResolved = await resolveOrg({ baseURL: resolvedBase, token: accessToken, requestedOrgId: orgId });
  const activeOrgId = toText(orgResolved.orgId);

  const existingSessionId = toText(process.env.E2E_SESSION_ID || "");
  if (existingSessionId) {
    const sess = await getSession({ baseURL: resolvedBase, token: accessToken, sessionId: existingSessionId, orgId: activeOrgId });
    if (sess.ok && !toText(sess.data?.error)) {
      const projectId = toText(sess.data?.project_id || sess.data?.projectId || "");
      await ensureReportSeed({ baseURL: resolvedBase, token: accessToken, orgId: activeOrgId, sessionId: existingSessionId, pathId });
      process.env.E2E_ORG_ID = activeOrgId;
      process.env.E2E_SESSION_ID = existingSessionId;
      process.env.E2E_PROJECT_ID = projectId;
      process.env.E2E_PATH_ID = pathId;
      process.env.E2E_BOOTSTRAP_CREATED = "0";
      return {
        orgId: activeOrgId,
        projectId,
        sessionId: existingSessionId,
        pathId,
        token: accessToken,
        bootstrapCreated: false,
      };
    }
  }

  const project = await createEnterpriseProject({ baseURL: resolvedBase, token: accessToken, orgId: activeOrgId });
  const session = await createEnterpriseSession({
    baseURL: resolvedBase,
    token: accessToken,
    orgId: activeOrgId,
    projectId: project.projectId,
  });
  await ensureReportSeed({
    baseURL: resolvedBase,
    token: accessToken,
    orgId: activeOrgId,
    sessionId: session.sessionId,
    pathId,
  });

  process.env.E2E_ORG_ID = activeOrgId;
  process.env.E2E_PROJECT_ID = project.projectId;
  process.env.E2E_SESSION_ID = session.sessionId;
  process.env.E2E_PATH_ID = pathId;
  process.env.E2E_BOOTSTRAP_CREATED = "1";
  process.env.E2E_BOOTSTRAP_PROJECT_ID = project.projectId;

  return {
    orgId: activeOrgId,
    projectId: project.projectId,
    sessionId: session.sessionId,
    pathId,
    token: accessToken,
    bootstrapCreated: true,
    bootstrapProjectId: project.projectId,
  };
}

export async function cleanupEnterpriseBootstrap({ baseURL, token, orgId, projectId } = {}) {
  const resolvedBase = toText(baseURL || DEFAULT_API_BASE);
  const pid = toText(projectId || process.env.E2E_BOOTSTRAP_PROJECT_ID || process.env.E2E_PROJECT_ID || "");
  if (!pid) {
    return { ok: true, skipped: true, reason: "missing_project_id" };
  }

  const email = toText(process.env.E2E_USER || process.env.E2E_ADMIN_EMAIL || "admin@local");
  const password = String(process.env.E2E_PASS || process.env.E2E_ADMIN_PASSWORD || "admin");
  const accessToken = toText(token) || await apiLogin({ baseURL: resolvedBase, email, password });
  const resolvedOrg = toText(orgId || process.env.E2E_ORG_ID || "");
  const endpoint = `${resolvedBase}/api/projects/${encodeURIComponent(pid)}`;
  const res = await requestJson(endpoint, {
    method: "DELETE",
    headers: buildHeaders(accessToken, resolvedOrg),
  });

  return {
    ok: res.ok || res.status === 404,
    status: res.status,
    deleted: res.ok,
    projectId: pid,
    orgId: resolvedOrg,
  };
}

function parseArgs(argv) {
  const src = Array.isArray(argv) ? argv : [];
  return {
    shell: src.includes("--shell"),
    cleanup: src.includes("--cleanup"),
    json: src.includes("--json"),
  };
}

function toShellExports(payload) {
  const lines = [];
  const pairs = {
    E2E_ORG_ID: toText(payload.orgId),
    E2E_PROJECT_ID: toText(payload.projectId),
    E2E_SESSION_ID: toText(payload.sessionId),
    E2E_PATH_ID: toText(payload.pathId),
    E2E_BOOTSTRAP_CREATED: payload.bootstrapCreated ? "1" : "0",
    E2E_BOOTSTRAP_PROJECT_ID: toText(payload.bootstrapProjectId || (payload.bootstrapCreated ? payload.projectId : "")),
    E2E_ACCESS_TOKEN: toText(payload.token),
  };
  for (const [key, value] of Object.entries(pairs)) {
    lines.push(`export ${key}=${shellEscape(value)}`);
  }
  return lines.join("\n");
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cleanup) {
    const result = await cleanupEnterpriseBootstrap({});
    if (!result.ok) {
      throw new Error(`[E2E_BOOTSTRAP] cleanup_failed status=${result.status || 0} project=${result.projectId || "-"}`);
    }
    if (args.shell) {
      process.stdout.write(`export E2E_BOOTSTRAP_PROJECT_ID=''\nexport E2E_BOOTSTRAP_CREATED='0'\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  const result = await ensureEnterpriseSession({});
  if (args.shell) {
    process.stdout.write(`${toShellExports(result)}\n`);
    return;
  }
  if (args.json || true) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  runCli().catch((err) => {
    const msg = err && err.message ? err.message : String(err || "bootstrap_failed");
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
