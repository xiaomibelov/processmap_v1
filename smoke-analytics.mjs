import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://clearvestnic.ru:5177";
const API_URL = process.env.SMOKE_API_URL || BASE_URL;
const SCREENSHOT_DIR = "/root/processmap_v1/smoke-screenshots";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function getToken() {
  const script = `from app.auth import create_access_token
from app.storage import get_default_org_id, upsert_org_membership
uid = "0217a3f745ae4bb6b72a336dd356f0d8"
org_id = get_default_org_id()
upsert_org_membership(org_id, uid, "admin")
print(create_access_token(uid))
`;
  const localFile = `/tmp/smoke_token_${Date.now()}.py`;
  const containerFile = `/tmp/smoke_token.py`;
  writeFileSync(localFile, script);
  execSync(`docker cp ${localFile} processmap_v1-api-1:${containerFile}`);
  const out = execSync(
    `docker exec processmap_v1-api-1 bash -c "cd /app/backend && PYTHONPATH=/app/backend python -u ${containerFile}"`,
    { encoding: "utf8" },
  );
  return out.trim().split("\n").pop().trim();
}

async function api(token, method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Activity_1" name="Smoke Task">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="smokeProp" value="smokeValue"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1"/>
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
</bpmn:definitions>`;

async function main() {
  console.log("Generating token...");
  const token = await getToken();
  console.log("Token ok");

  const runId = `${Date.now()}`;
  console.log("Creating project...");
  const project = await api(token, "POST", "/api/projects", { title: `Smoke Project ${runId}` });
  const projectId = project.id || project.project_id;
  const workspaceId = project.workspace_id || "";
  console.log("Project:", projectId, "workspace:", workspaceId);

  console.log("Creating session...");
  const session = await api(token, "POST", `/api/projects/${projectId}/sessions`, { title: `Smoke Session ${runId}` });
  const sessionId = session.id || session.session_id;
  console.log("Session:", sessionId);

  console.log("Saving BPMN...");
  await api(token, "PUT", `/api/sessions/${sessionId}/bpmn`, { xml: bpmnXml, rev: 0 });

  console.log("Recomputing analytics...");
  await api(token, "POST", `/api/sessions/${sessionId}/recompute`, {});

  // Give read-model a moment
  await new Promise((r) => setTimeout(r, 1500));

  console.log("Launching browser...");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (msg) => console.log("[console]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("[pageerror]", err.message, err.stack));
  page.on("requestfailed", (req) => console.log("[requestfailed]", req.url(), req.failure()?.errorText));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("[response]", res.status(), res.url());
  });

  // Inject auth before any scripts run
  const SMOKE_USER_ID = "0217a3f745ae4bb6b72a336dd356f0d8";
  await page.context().addInitScript((t) => {
    localStorage.setItem("fpc_auth_access_token", t.token);
    localStorage.setItem("fpc_active_org_id", "org_default");
    try {
      sessionStorage.setItem(`fpc_org_choice_done:${t.uid}`, "1");
    } catch {}
  }, { token, uid: SMOKE_USER_ID });
  await page.goto(`${BASE_URL}/`);

  // 1. Analytics session overview
  console.log("Screenshot: session overview");
  await page.goto(`${BASE_URL}/analytics/session/${sessionId}/overview`);
  await page.waitForLoadState("networkidle");
  console.log("overview url:", page.url());
  console.log("overview text snippet:", (await page.textContent("body")).slice(0, 300));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-session-overview.png`, fullPage: true });

  // 2. Properties tab
  console.log("Screenshot: session properties");
  await page.goto(`${BASE_URL}/analytics/session/${sessionId}/properties`);
  await page.waitForLoadState("networkidle");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-session-properties.png`, fullPage: true });

  // 3. Actions tab
  console.log("Screenshot: session actions");
  await page.goto(`${BASE_URL}/analytics/session/${sessionId}/actions`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-session-actions.png`, fullPage: true });

  // 4. Dashboards tab
  console.log("Screenshot: session dashboards");
  await page.goto(`${BASE_URL}/analytics/session/${sessionId}/dashboards`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-session-dashboards.png`, fullPage: true });

  // 5. Workspace scope via switcher
  if (workspaceId) {
    console.log("Screenshot: workspace overview (scope switch)");
    await page.goto(`${BASE_URL}/analytics/workspace/${workspaceId}/overview`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-workspace-overview.png`, fullPage: true });
  }

  // 6. Legacy redirect
  console.log("Screenshot: legacy redirect");
  await page.goto(`${BASE_URL}/app?surface=analytics&project=${projectId}&session=${sessionId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-legacy-redirect.png`, fullPage: true });
  const redirectedPath = new URL(page.url()).pathname;
  console.log("Legacy redirect landed at:", redirectedPath);
  if (!redirectedPath.startsWith("/analytics/session/")) {
    throw new Error(`Legacy redirect failed: ${page.url()}`);
  }

  // 7. Canvas no overlay
  console.log("Screenshot: canvas session");
  await page.goto(`${BASE_URL}/app?project=${projectId}&session=${sessionId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-canvas-session.png`, fullPage: true });

  // 8. CSV export click (properties)
  console.log("Screenshot: CSV export");
  await page.goto(`${BASE_URL}/analytics/session/${sessionId}/properties`);
  await page.waitForLoadState("networkidle");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Экспорт CSV" }).click(),
  ]);
  const csvPath = `${SCREENSHOT_DIR}/exported-properties.csv`;
  await download.saveAs(csvPath);
  console.log("CSV saved:", csvPath, "size:", (await download.createReadStream)?.length ?? "unknown");

  await browser.close();
  console.log("Smoke test done. Screenshots in", SCREENSHOT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
