// Helper org ≠ default для e2e-спеков feature/async-save-pipeline-step2
// (TESTS.md §4, урок #989: acceptance-спеки обязаны работать на org ≠ default —
// на stage org-ContextVar пуст в threadpool-контексте sync-endpoint'ов, и баги
// класса #989 видны только вне дефолтной org).
//
// Контракт:
//   - createNonDefaultOrg(request, auth) → orgId: POST /api/orgs от
//     platform-admin; creator автоматически становится org_owner
//     (create_org_record — INSERT org_memberships role='org_owner').
//   - createOrgProject(request, auth, orgId, title) → projectId — проверенный
//     step1-путь POST /api/projects с header X-Org-Id (create_project
//     резолвит org из _request_active_org_id — проект создаётся В org).
//   - createOrgSession(request, auth, orgId, projectId, title) → sessionId —
//     POST /api/projects/{id}/sessions?mode=quick_skeleton (org scope
//     наследуется от проекта через _legacy_load_project_scoped).
//   - seedOrgSessionBpmn(request, auth, orgId, sessionId, xml) — PUT /bpmn
//     с явным X-Org-Id.
//   - orgHeaders(auth, orgId) — Authorization + X-Org-Id для API-сверок.
//   - createOrgUser(request, auth, {email, password, fullName, orgId, role})
//     — POST /api/admin/users с membership в org (второй пользователь для
//     multi-user сценариев: presence группирует по user_id, поэтому soft-lock
//     требует РАЗНЫХ пользователей в двух контекстах).
//   - loginOrgUser(request, {email, password}) — apiLogin под вторым юзером.

import { expect } from "@playwright/test";

import { apiLogin, withAuthHeaders } from "./e2eAuth.mjs";
import { API_BASE } from "./processFixture.mjs";

export function orgHeaders(auth, orgId) {
  return withAuthHeaders(auth.accessToken, orgId ? { "X-Org-Id": String(orgId).trim() } : {});
}

export async function createNonDefaultOrg(request, auth, name = "") {
  const res = await request.post(`${API_BASE}/api/orgs`, {
    headers: withAuthHeaders(auth.accessToken),
    data: { name: String(name || "").trim() || `E2E non-default org ${Date.now()}` },
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create org: ${text}`).toBeTruthy();
  const body = JSON.parse(text || "{}");
  const orgId = String(body.id || body.org_id || "").trim();
  expect(orgId, `org id missing in ${text}`).not.toBe("");
  return orgId;
}

export async function createOrgProject(request, auth, orgId, title) {
  const res = await request.post(`${API_BASE}/api/projects`, {
    headers: orgHeaders(auth, orgId),
    data: { title: String(title || "").trim() || `E2E org project ${Date.now()}`, passport: {} },
  });
  const text = await res.text();
  expect(res.ok(), `create org project: ${text}`).toBeTruthy();
  const body = JSON.parse(text || "{}");
  const projectId = String(body.id || body.project_id || "").trim();
  const projectOrgId = String(body.org_id || body.orgId || "").trim();
  expect(projectId, `project id missing in ${text}`).not.toBe("");
  // Урок #989: проект ОБЯЗАН лечь в org ≠ default.
  expect(projectOrgId, `project must be created in org ${orgId}, got org ${projectOrgId || "(default)"}`).toBe(orgId);
  return projectId;
}

export async function createOrgSession(request, auth, orgId, projectId, title) {
  const res = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: orgHeaders(auth, orgId),
      data: {
        title: String(title || "").trim() || `E2E org session ${Date.now()}`,
        roles: ["Оператор"],
        start_role: "Оператор",
      },
    },
  );
  const text = await res.text();
  expect(res.ok(), `create org session: ${text}`).toBeTruthy();
  const body = JSON.parse(text || "{}");
  const sessionId = String(body.id || body.session_id || "").trim();
  expect(sessionId, `session id missing in ${text}`).not.toBe("");
  return sessionId;
}

export async function seedOrgSessionBpmn(request, auth, orgId, sessionId, xml) {
  const res = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers: orgHeaders(auth, orgId),
    data: {
      xml: String(xml || ""),
      base_diagram_state_version: 0,
      base_bpmn_xml_version: 0,
    },
  });
  const text = await res.text();
  expect(res.ok(), `seed org session bpmn: ${text}`).toBeTruthy();
}

/** Полный бутстрап сессии в org ≠ default. Возвращает { orgId, projectId, sessionId }. */
export async function createOrgSessionFixture(request, auth, { orgName = "", projectTitle = "", sessionTitle = "", xml }) {
  const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const orgId = await createNonDefaultOrg(request, auth, orgName || `E2E non-default ${runTag}`);
  const projectId = await createOrgProject(request, auth, orgId, projectTitle || `E2E org project ${runTag}`);
  const sessionId = await createOrgSession(request, auth, orgId, projectId, sessionTitle || `E2E org session ${runTag}`);
  if (typeof xml === "string" && xml.trim()) {
    await seedOrgSessionBpmn(request, auth, orgId, sessionId, xml);
  }
  return { orgId, projectId, sessionId };
}

export async function createOrgUser(request, auth, { email, password, fullName = "", orgId = "", role = "org_member" } = {}) {
  const res = await request.post(`${API_BASE}/api/admin/users`, {
    headers: withAuthHeaders(auth.accessToken),
    data: {
      email: String(email || "").trim(),
      password: String(password || ""),
      is_admin: false,
      is_active: true,
      full_name: String(fullName || "").trim(),
      memberships: orgId ? [{ org_id: String(orgId).trim(), role: String(role || "org_member") }] : [],
    },
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create org user: ${text}`).toBeTruthy();
  const body = JSON.parse(text || "{}");
  return body.item || body;
}

export function loginOrgUser(request, { email, password }) {
  return apiLogin(request, { email, password });
}
