const DEFAULT_API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const ACCESS_TOKEN_KEY = "fpc_auth_access_token";
const ACTIVE_ORG_KEY = "fpc_active_org_id";

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: String(text || "") };
  }
}

function summarizePayloadKeys(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "-";
  const keys = Object.keys(payload);
  return keys.length ? keys.join(",") : "-";
}

export function withAuthHeaders(token, headers = {}) {
  const auth = String(token || "").trim();
  return {
    ...headers,
    Authorization: `Bearer ${auth}`,
  };
}

export async function apiLogin(request, options = {}) {
  const apiBase = String(options.apiBase || DEFAULT_API_BASE).trim();
  const email = String(
    options.email
      || process.env.E2E_USER
      || process.env.E2E_ADMIN_EMAIL
      || "admin@local",
  ).trim();
  const password = String(
    options.password
      || process.env.E2E_PASS
      || process.env.E2E_ADMIN_PASSWORD
      || "admin",
  );
  const endpoint = `${apiBase}/api/auth/login`;
  const payload = { email, password };
  const res = await request.post(endpoint, { data: payload });
  const text = await res.text();
  const body = safeJsonParse(text);
  if (!res.ok()) {
    throw new Error(
      `[E2E_AUTH] login_failed status=${res.status()} endpoint=${endpoint} payloadKeys=${summarizePayloadKeys(payload)} detail=${text}`,
    );
  }
  const accessToken = String(body?.access_token || "").trim();
  if (!accessToken) {
    throw new Error(
      `[E2E_AUTH] login_missing_access_token status=${res.status()} endpoint=${endpoint} payloadKeys=${summarizePayloadKeys(payload)}`,
    );
  }
  let activeOrgId = "";
  try {
    const meRes = await request.get(`${apiBase}/api/auth/me`, {
      headers: withAuthHeaders(accessToken),
    });
    if (meRes.ok()) {
      const meText = await meRes.text();
      const meBody = safeJsonParse(meText);
      const user = meBody?.user && typeof meBody.user === "object" ? meBody.user : {};
      activeOrgId = String(user?.active_org_id || user?.default_org_id || "").trim();
    }
  } catch {
    activeOrgId = "";
  }
  return {
    accessToken,
    headers: withAuthHeaders(accessToken, activeOrgId ? { "X-Org-Id": activeOrgId } : {}),
    email,
    activeOrgId,
  };
}

export async function setUiToken(page, token, options = {}) {
  const accessToken = String(token || "").trim();
  const activeOrgId = String(options?.activeOrgId || "").trim();
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(String(key || ""), String(value || ""));
  }, {
    key: ACCESS_TOKEN_KEY,
    value: accessToken,
  });
  if (activeOrgId) {
    await page.addInitScript(({ key, value }) => {
      window.localStorage.setItem(String(key || ""), String(value || ""));
    }, {
      key: ACTIVE_ORG_KEY,
      value: activeOrgId,
    });
  }
}
