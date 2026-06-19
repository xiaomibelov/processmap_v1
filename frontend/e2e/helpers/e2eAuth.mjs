const DEFAULT_API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const DEFAULT_APP_BASE = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";
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

function parseUrlHostname(url) {
  try {
    return new URL(String(url || "")).hostname || "";
  } catch {
    return "";
  }
}

function parseSetCookie(headerValue) {
  const raw = String(headerValue || "").trim();
  if (!raw) return null;
  const segments = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const [first] = segments;
  const eq = first.indexOf("=");
  if (eq < 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  const attrs = {};
  for (let i = 1; i < segments.length; i += 1) {
    const part = segments[i];
    const idx = part.indexOf("=");
    const key = (idx < 0 ? part : part.slice(0, idx)).trim();
    const val = idx < 0 ? "" : part.slice(idx + 1).trim();
    attrs[key.toLowerCase()] = val;
  }
  return { name, value, attrs };
}

function maxAgeToExpiresSeconds(maxAge) {
  const sec = Number(maxAge);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.floor(Date.now() / 1000) + sec;
}

export function withAuthHeaders(token, headers = {}) {
  const auth = String(token || "").trim();
  return {
    ...headers,
    Authorization: `Bearer ${auth}`,
  };
}

// Keeps the refresh cookie for the most recently issued access tokens so that
// plain `setUiToken(page, auth.accessToken)` calls can still refresh.
const accessTokenToRefreshCookie = new Map();

function rememberRefreshCookie(accessToken, refreshToken, refreshCookie) {
  const key = String(accessToken || "").trim();
  if (!key) return;
  accessTokenToRefreshCookie.set(key, { refreshToken, refreshCookie });
  if (accessTokenToRefreshCookie.size > 50) {
    const first = accessTokenToRefreshCookie.keys().next().value;
    accessTokenToRefreshCookie.delete(first);
  }
}

function recallRefreshCookie(accessToken) {
  const key = String(accessToken || "").trim();
  if (!key) return null;
  return accessTokenToRefreshCookie.get(key) || null;
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
      const user = (meBody?.user && typeof meBody.user === "object")
        ? meBody.user
        : (meBody && typeof meBody === "object" ? meBody : {});
      activeOrgId = String(user?.active_org_id || user?.default_org_id || "").trim();
    }
  } catch {
    activeOrgId = "";
  }
  const setCookieHeader = res.headers()?.["set-cookie"] ?? "";
  const refreshCookie = parseSetCookie(setCookieHeader);
  const refreshToken = refreshCookie?.name === "refresh_token" ? refreshCookie.value : "";

  rememberRefreshCookie(accessToken, refreshToken, refreshCookie);

  return {
    accessToken,
    refreshToken,
    refreshCookie,
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

  let refreshToken = String(options?.refreshToken || "").trim();
  let refreshCookie = options?.refreshCookie || null;
  if (!refreshToken) {
    const recalled = recallRefreshCookie(accessToken);
    if (recalled) {
      refreshToken = recalled.refreshToken;
      refreshCookie = recalled.refreshCookie;
    }
  }
  if (refreshToken && typeof page.context()?.addCookies === "function") {
    const appBase = String(options?.appBaseUrl || process.env.E2E_APP_BASE_URL || DEFAULT_APP_BASE).trim();
    const hostname = parseUrlHostname(appBase) || "127.0.0.1";
    const attrs = refreshCookie?.attrs || {};
    const maxAgeSec = Number(attrs["max-age"] || attrs["maxage"] || 0);
    const cookie = {
      name: "refresh_token",
      value: refreshToken,
      domain: hostname,
      path: String(attrs.path || "/"),
      httpOnly: true,
      secure: "secure" in attrs || /^https:/i.test(appBase),
      sameSite: String(attrs.samesite || "Lax").replace(/^lax$/i, "Lax").replace(/^strict$/i, "Strict").replace(/^none$/i, "None"),
      expires: maxAgeSec > 0 ? maxAgeToExpiresSeconds(maxAgeSec) : undefined,
    };
    await page.context().addCookies([cookie]);
  }
}
