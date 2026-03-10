import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fnv1aHex, hasDiMarkers, makeBigDiagramXmlOptional } from "./helpers/bpmnFixtures.mjs";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function payloadKeys(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "-";
  const keys = Object.keys(payload);
  return keys.length ? keys.join(",") : "-";
}

async function apiJson(res, opLabel, meta = {}) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  const url = String(meta?.url || res.url?.() || "-");
  const keys = payloadKeys(meta?.payload);
  expect(
    res.ok(),
    `${opLabel}: status=${res.status()} endpoint=${url} payloadKeys=${keys} body=${txt}`,
  ).toBeTruthy();
  return body;
}

async function createFixture(request, runId, xmlText, authHeaders) {
  const projectPayload = { title: `E2E roundtrip project ${runId}`, passport: {} };
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: projectPayload,
  });
  const project = await apiJson(projectRes, "create project", {
    url: `${API_BASE}/api/projects`,
    payload: projectPayload,
  });
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionPayload = {
    title: `E2E roundtrip session ${runId}`,
    roles: ["Lane 1", "Lane 2", "Lane 3"],
    start_role: "Lane 1",
  };
  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: sessionPayload,
    },
  );
  const session = await apiJson(sessionRes, "create session", {
    url: `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    payload: sessionPayload,
  });
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const bpmnPayload = { xml: xmlText };
  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers: authHeaders,
    data: bpmnPayload,
  });
  await apiJson(putRes, "seed bpmn", {
    url: `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`,
    payload: bpmnPayload,
  });

  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture, accessToken) {
  const projectSelect = page.locator(".topbar .topSelect--project");
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
    window.localStorage.setItem("fpc_debug_trace", "1");
  });
  await page.goto("/app");
  const hasWorkspace = await projectSelect.isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasWorkspace) {
    await page.evaluate((token) => {
      window.localStorage.setItem("fpc_auth_access_token", String(token || ""));
    }, accessToken);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await expect(projectSelect).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function assertDiagramHealthy(page, label) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return { ok: false, registryCount: -1, svgRect: "0x0" };
        const registry = modeler.get("elementRegistry");
        const all = registry?.getAll?.() || [];
        const canvas = modeler.get("canvas");
        const svg = canvas?._container?.querySelector?.("svg");
        const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
        const w = Math.round(Number(rect.width || 0));
        const h = Math.round(Number(rect.height || 0));
        return {
          ok: all.length > 0 && w > 0 && h > 0,
          registryCount: all.length,
          svgRect: `${w}x${h}`,
        };
      });
    }, label)
    .toMatchObject({ ok: true });
}

async function readXml(page) {
  await switchTab(page, "XML");
  const area = page.locator(".xmlEditorTextarea");
  await expect(area).toBeVisible();
  const xml = await area.inputValue();
  return { xml, len: xml.length, hash: fnv1aHex(xml) };
}

async function readXmlFromDiagram(page) {
  const probe = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, xml: "", error: "modeler_missing" };
    try {
      const saved = await modeler.saveXML({ format: true });
      return { ok: true, xml: String(saved?.xml || "") };
    } catch (error) {
      return { ok: false, xml: "", error: String(error?.message || error) };
    }
  });
  expect(probe.ok, JSON.stringify(probe)).toBeTruthy();
  return {
    xml: String(probe.xml || ""),
    len: String(probe.xml || "").length,
    hash: fnv1aHex(probe.xml || ""),
  };
}

async function saveAndWaitPut(page) {
  const putOk = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await page.locator("button.processSaveBtn").first().click();
  await putOk;
}

async function addTaskInDiagram(page, label) {
  const mutation = await page.evaluate((taskLabel) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const source = registry.get("Task_1_3") || registry.get("Task_1_1") || registry.get("Activity_1");
      if (!source) return { ok: false, error: "source_task_missing" };
      modeling.updateLabel(source, taskLabel);
      const root = source.parent;
      const next = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(source.x || 0) + 210, y: Number(source.y || 0) + 80 },
        root,
      );
      modeling.updateLabel(next, `${taskLabel}_NEW`);
      modeling.connect(source, next, { type: "bpmn:SequenceFlow" });
      return { ok: true, id: String(next.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, label);
  expect(mutation.ok, JSON.stringify(mutation)).toBeTruthy();
}

function countToken(xml, pattern) {
  return (String(xml || "").match(pattern) || []).length;
}

test("big BPMN round-trip keeps DI and stable payload after export/import", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = `ROUNDTRIP_${runId.slice(-6)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixturePayload = await makeBigDiagramXmlOptional({
    seed: 20260220,
    pools: 2,
    lanes: 3,
    tasks: 7,
    edges: 12,
    annotations: 3,
  });
  const seedXml = String(fixturePayload?.xml || "");
  // eslint-disable-next-line no-console
  console.log(
    `[FIXTURE] source=${String(fixturePayload?.source || "unknown")} xmlLen=${seedXml.length} hasDI=${hasDiMarkers(seedXml) ? "true" : "false"} hash=${fnv1aHex(seedXml)}`,
  );
  const fixture = await createFixture(request, runId, seedXml, auth.headers);

  const putPayloads = [];
  page.on("request", (req) => {
    if (req.method() !== "PUT") return;
    if (!/\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(req.url())) return;
    try {
      const body = req.postDataJSON?.() || {};
      const xml = String(body?.xml || "");
      putPayloads.push({ hash: fnv1aHex(xml), len: xml.length });
    } catch {
      putPayloads.push({ hash: "", len: 0 });
    }
  });

  await setUiToken(page, auth.accessToken);
  await openFixture(page, fixture, auth.accessToken);
  await assertDiagramHealthy(page, "diagram_initial_ready");

  const initialXml = await readXml(page);
  const initialTaskCount = countToken(initialXml.xml, /<(?:\w+:)?task\b/gi);
  expect(initialXml.len).toBeGreaterThan(4000);
  expect(hasDiMarkers(initialXml.xml)).toBeTruthy();

  await switchTab(page, "Diagram");
  await assertDiagramHealthy(page, "diagram_before_mutation");
  await addTaskInDiagram(page, marker);
  const mutatedInRuntime = await readXmlFromDiagram(page);
  const runtimeTaskCount = countToken(mutatedInRuntime.xml, /<(?:\w+:)?task\b/gi);
  expect(runtimeTaskCount).toBeGreaterThanOrEqual(initialTaskCount);
  await saveAndWaitPut(page);
  const persistedAfterSave = await readXml(page);
  expect(hasDiMarkers(persistedAfterSave.xml)).toBeTruthy();
  const persistedTaskCount = countToken(persistedAfterSave.xml, /<(?:\w+:)?task\b/gi);
  expect(persistedTaskCount).toBeGreaterThanOrEqual(initialTaskCount);

  await switchTab(page, "Diagram");
  const exportBtn = page.getByRole("button", { name: /Экспорт|Export/i }).first();
  await expect(exportBtn).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await exportBtn.evaluate((node) => node.click());
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const exportedXml = await readFile(String(downloadPath), "utf-8");
  const exportedHash = fnv1aHex(exportedXml);
  const exportedLen = exportedXml.length;
  const exportedTaskCount = countToken(exportedXml, /<(?:\w+:)?task\b/gi);
  const exportedShapeCount = countToken(exportedXml, /<(?:\w+:)?BPMNShape\b/gi);
  const exportedEdgeCount = countToken(exportedXml, /<(?:\w+:)?BPMNEdge\b/gi);

  expect(hasDiMarkers(exportedXml)).toBeTruthy();
  expect(exportedLen).toBeGreaterThan(4000);

  const importInput = page.locator('input[type="file"][accept*=".bpmn"]').first();
  await importInput.setInputFiles(String(downloadPath));
  await expect(page.getByText(/BPMN распознан|BPMN загружен/i)).toBeVisible();
  await assertDiagramHealthy(page, "diagram_after_reimport");

  const reimportedXml = await readXml(page);
  const reimportedTaskCount = countToken(reimportedXml.xml, /<(?:\w+:)?task\b/gi);
  const reimportedShapeCount = countToken(reimportedXml.xml, /<(?:\w+:)?BPMNShape\b/gi);
  const reimportedEdgeCount = countToken(reimportedXml.xml, /<(?:\w+:)?BPMNEdge\b/gi);
  expect(hasDiMarkers(reimportedXml.xml)).toBeTruthy();
  expect(reimportedXml.len).toBeGreaterThanOrEqual(Math.floor(exportedLen * 0.9));
  expect(reimportedXml.len).toBeLessThanOrEqual(Math.ceil(exportedLen * 1.15));
  expect(reimportedTaskCount).toBeGreaterThanOrEqual(exportedTaskCount);
  expect(reimportedShapeCount).toBeGreaterThanOrEqual(Math.floor(exportedShapeCount * 0.95));
  expect(reimportedEdgeCount).toBeGreaterThanOrEqual(Math.floor(exportedEdgeCount * 0.95));
  const stableByHash = reimportedXml.hash === exportedHash;
  const stableByStructure = reimportedTaskCount >= exportedTaskCount
    && reimportedShapeCount >= Math.floor(exportedShapeCount * 0.95)
    && reimportedEdgeCount >= Math.floor(exportedEdgeCount * 0.95);
  expect(stableByHash || stableByStructure).toBeTruthy();

  expect(putPayloads.length).toBeGreaterThanOrEqual(1);
  const distinctPutPayloads = new Set(putPayloads.map((it) => `${it.hash}:${it.len}`));
  expect(distinctPutPayloads.size).toBeGreaterThanOrEqual(1);
});
