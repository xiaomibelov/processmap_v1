import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

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

async function activeTabId(page) {
  return await page.evaluate(() => {
    const btn = document.querySelector(".segBtn.on");
    return String(btn?.textContent || "").trim().toLowerCase();
  });
}

async function waitModeler(page) {
  await page.waitForFunction(() => !!window.__FPC_E2E_MODELER__, null, { timeout: 20_000 });
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

async function addSimpleDiagramElements(page) {
  return await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, error: "no_modeler" };
    try {
      const modeling = m.get("modeling");
      const ef = m.get("elementFactory");
      const canvas = m.get("canvas");
      const root = canvas.getRootElement();
      const participant = modeling.createShape(ef.createParticipantShape(), { x: 360, y: 220 }, root);
      try { modeling.addLane(participant, "bottom"); } catch {}
      const task = modeling.createShape(ef.createShape({ type: "bpmn:Task" }), { x: 620, y: 260 }, participant);
      modeling.updateLabel(task, "R6 smoke");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

test("no auto rollback to interview after explicit diagram selection across session hops", async ({ page, request }) => {
  const tabLogs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[TAB_SET]")) tabLogs.push(text);
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });

  const projectId = await createProject(request, `R6 smoke ${Date.now()}`);

  await page.goto("/");
  await page.waitForSelector(".topbar .topSelect--project");
  await page.selectOption(".topbar .topSelect--project", projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await page.waitForTimeout(400);

  const s1 = await createSessionViaModal(page);
  await switchTab(page, "Diagram");
  await waitModeler(page);
  const createRes = await addSimpleDiagramElements(page);
  expect(createRes.ok, JSON.stringify(createRes)).toBeTruthy();
  await page.waitForTimeout(450);

  await switchTab(page, "Interview");
  await page.waitForTimeout(220);
  await switchTab(page, "Diagram");
  await page.waitForTimeout(450);
  expect(await activeTabId(page)).toContain("diagram");

  const logsStart = tabLogs.length;
  const s2 = await createSessionViaModal(page);
  await switchTab(page, "Diagram");
  await waitModeler(page);
  await page.waitForTimeout(250);

  for (let i = 0; i < 8; i += 1) {
    await page.selectOption(".topbar .topSelect--session", i % 2 === 0 ? s1 : s2);
    await page.waitForTimeout(150);
    await switchTab(page, "Diagram");
    await page.waitForTimeout(250);
    expect(await activeTabId(page)).toContain("diagram");
  }

  const rollbackLogs = tabLogs
    .slice(logsStart)
    .filter((line) =>
      line.includes("to=interview")
      && line.includes("reason=session_change_default_tab")
      && !line.includes("intent=intent")
      && (line.includes(`sid=${s1}`) || line.includes(`sid=${s2}`)),
    );
  expect(rollbackLogs, rollbackLogs.join("\n")).toEqual([]);
});
