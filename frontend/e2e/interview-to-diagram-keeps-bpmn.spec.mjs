import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function apiJson(res, op) {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${op}: ${res.status()} ${txt}`);
  return txt ? JSON.parse(txt) : {};
}

async function createProject(request, title) {
  const res = await request.post(`${API}/api/projects`, {
    data: { title, passport: {} },
  });
  const body = await apiJson(res, "create project");
  return String(body.id || "");
}

async function switchTab(page, label) {
  await page.locator(".segBtn").filter({ hasText: new RegExp(`^${label}$`, "i") }).first().click();
}

async function waitModeler(page) {
  await page.waitForFunction(() => !!window.__FPC_E2E_MODELER__, null, { timeout: 20_000 });
}

async function activeTab(page) {
  return await page.evaluate(() => String(document.querySelector(".segBtn.on")?.textContent || "").trim().toLowerCase());
}

async function createSessionViaModal(page) {
  const before = await page.evaluate(() =>
    [...document.querySelectorAll(".topbar .topSelect--session option")]
      .map((n) => String(n.value || "").trim())
      .filter(Boolean),
  );
  await page.getByRole("button", { name: "Создать сессию" }).click();
  await page.getByRole("button", { name: "Создать и начать интервью" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Обновить" }).click();
  await page.waitForTimeout(350);
  const after = await page.evaluate(() =>
    [...document.querySelectorAll(".topbar .topSelect--session option")]
      .map((n) => String(n.value || "").trim())
      .filter(Boolean),
  );
  const sid = after.find((x) => !before.includes(x))
    || await page.evaluate(() => String(document.querySelector(".topbar .topSelect--session")?.value || "").trim());
  if (sid) {
    await page.selectOption(".topbar .topSelect--session", sid);
    await page.waitForTimeout(300);
  }
  return sid;
}

async function createPoolLaneTask(page) {
  return await page.evaluate(async () => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, error: "no_modeler" };
    try {
      const modeling = m.get("modeling");
      const ef = m.get("elementFactory");
      const canvas = m.get("canvas");
      const root = canvas.getRootElement();
      const participant = modeling.createShape(ef.createParticipantShape(), { x: 420, y: 240 }, root);
      try { modeling.addLane(participant, "bottom"); } catch {}
      const task = modeling.createShape(ef.createShape({ type: "bpmn:Task" }), { x: 700, y: 300 }, participant);
      modeling.updateLabel(task, "R9 merge guard task");
      return { ok: true, participantId: participant.id, taskId: task.id };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

async function readDiagramXml(page) {
  return await page.evaluate(async () => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return "";
    try {
      const out = await m.saveXML({ format: true });
      return String(out?.xml || "");
    } catch {
      return "";
    }
  });
}

async function probeDiagram(page) {
  return await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, reason: "no_modeler" };
    try {
      const reg = m.get("elementRegistry");
      const canvas = m.get("canvas");
      const container = canvas?._container;
      const svg = container?.querySelector?.("svg");
      const rect = container?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const svgRect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const count = Array.isArray(reg?.getAll?.()) ? reg.getAll().length : 0;
      return {
        ok: true,
        registryCount: count,
        rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        svgRect: `${Math.round(svgRect.width)}x${Math.round(svgRect.height)}`,
      };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  });
}

test("interview -> diagram keeps BPMN when PATCH response returns empty bpmn_xml", async ({ page, request }) => {
  const logs = [];
  const network = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("[PATCH_SESSION]")
      || text.includes("[DRAFT_MERGE]")
      || text.includes("[MERGE_SKIP_EMPTY_BPMN_XML]")
      || text.includes("[IMPORT]")
      || text.includes("[PROBE]")
      || text.includes("SAVE_PERSIST_DONE")
    ) {
      logs.push(text);
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/sessions/")) return;
    if (!/(\/bpmn$|\/api\/sessions\/[^/]+$|recompute)/.test(url)) return;
    network.push(`${res.request().method()} ${url.replace(API, "")} ${res.status()}`);
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });

  const projectId = await createProject(request, `R9 merge guard ${Date.now()}`);
  await page.goto("/");
  await page.waitForSelector(".topbar .topSelect--project");
  await page.selectOption(".topbar .topSelect--project", projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await page.waitForTimeout(350);

  const sid = await createSessionViaModal(page);
  await switchTab(page, "Diagram");
  await waitModeler(page);
  const createRes = await createPoolLaneTask(page);
  expect(createRes.ok, JSON.stringify(createRes)).toBeTruthy();
  await page.waitForTimeout(900);

  const xmlBefore = await readDiagramXml(page);
  expect(xmlBefore).toContain("R9 merge guard task");
  expect(xmlBefore.length).toBeGreaterThan(0);

  let patchRewriteCount = 0;
  await page.route(`**/api/sessions/${sid}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    const backend = await route.fetch();
    const bodyText = await backend.text();
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = {};
    }
    if (body && typeof body === "object") {
      body.bpmn_xml = "";
      patchRewriteCount += 1;
    }
    const headers = { ...backend.headers(), "content-type": "application/json" };
    await route.fulfill({
      status: backend.status(),
      headers,
      body: JSON.stringify(body),
    });
  });

  await switchTab(page, "Interview");
  await page.waitForTimeout(450);
  await switchTab(page, "Diagram");
  await page.waitForTimeout(900);

  expect(await activeTab(page)).toContain("diagram");
  expect(patchRewriteCount).toBeGreaterThan(0);

  const xmlAfter = await readDiagramXml(page);
  const h2 = fnv1aHex(xmlAfter);
  expect(xmlAfter.length).toBeGreaterThan(0);
  expect(xmlAfter).toContain("R9 merge guard task");
  expect(h2).not.toBe("811c9dc5");

  const probe = await probeDiagram(page);
  expect(probe.ok, JSON.stringify(probe)).toBeTruthy();
  expect(probe.registryCount).toBeGreaterThan(0);

  const mergedSkip = logs.find((line) => line.includes("[MERGE_SKIP_EMPTY_BPMN_XML]"));
  expect(mergedSkip, `logs tail:\\n${logs.slice(-80).join("\\n")}`).toBeTruthy();
  const rollbackMerge = logs.find((line) => {
    if (!line.includes("[DRAFT_MERGE]")) return false;
    if (!line.includes("source=patch_session")) return false;
    const beforeMatch = line.match(/beforeLen=(\\d+)/);
    const afterMatch = line.match(/afterLen=(\\d+)/);
    const beforeLen = Number(beforeMatch?.[1] || 0);
    const afterLen = Number(afterMatch?.[1] || 0);
    return beforeLen > 0 && afterLen === 0;
  });
  expect(rollbackMerge, `logs tail:\\n${logs.slice(-100).join("\\n")}`).toBeFalsy();
  const putBpmn = network.find((line) => line.includes("PUT") && line.includes(`/api/sessions/${sid}/bpmn`) && line.endsWith(" 200"));
  expect(putBpmn, `network tail:\\n${network.slice(-40).join("\\n")}`).toBeTruthy();
});
