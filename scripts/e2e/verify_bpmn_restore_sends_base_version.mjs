import { chromium } from "playwright-core";
import {
  login,
  createBackendSession,
  openSession,
  BASE_URL,
  BPMN_XML,
} from "./savePipelineE2EHelpers.mjs";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("dialog", (dialog) => {
    dialog.accept().catch(() => {});
  });

  await login(page);
  const sessionId = await createBackendSession(page);

  // Create a second BPMN version so there is a version to restore.
  const token = await page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || "").trim());
  const putRes = await page.evaluate(
    async ({ sid, xml, token: t }) => {
      const res = await fetch(`/api/sessions/${sid}/bpmn`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ xml, base_diagram_state_version: 1 }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    { sid: sessionId, xml: BPMN_XML.replace('name="Verify me"', 'name="Verify me v2"'), token },
  );
  if (putRes.status >= 400) throw new Error(`second BPMN PUT failed: ${putRes.status}`);
  const serverVersion = putRes.body?.diagram_state_version ?? 0;
  if (!serverVersion) throw new Error("server diagram_state_version missing after second PUT");

  await openSession(page, sessionId);

  let restoreRequest = null;
  let restoreResponse = null;
  await page.route(/\/api\/sessions\/[^/]+\/bpmn\/restore\//, async (route, request) => {
    restoreRequest = {
      url: request.url(),
      method: request.method(),
      postData: request.postData(),
    };
    const response = await route.fetch();
    restoreResponse = { status: response.status(), body: await response.text() };
    await route.fulfill({ response });
  });

  await page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').click();
  await page.waitForSelector('[data-testid="diagram-toolbar-overlay"]', { timeout: 5000 });
  await page.locator('[data-testid="bpmn-versions-open"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="bpmn-versions-show-technical"]').click();
  await page.waitForSelector('[data-testid="bpmn-version-item"]', { timeout: 15000 });

  const firstItem = page.locator('[data-testid="bpmn-version-item"]').nth(0);
  await firstItem.locator('[data-testid="bpmn-version-restore"]').click();
  await page.waitForTimeout(1500);

  if (!restoreRequest) throw new Error("restore request was not sent");
  const body = JSON.parse(restoreRequest.postData || "{}");
  if (!Number.isFinite(body.base_diagram_state_version) || body.base_diagram_state_version < 0) {
    throw new Error(`restore request missing valid base_diagram_state_version: ${JSON.stringify(body)}`);
  }
  if (body.base_diagram_state_version !== serverVersion) {
    // A stale base is acceptable from a CAS perspective; the backend will reply
    // with 409 and the frontend can reconcile. The regression we are guarding
    // against is the *missing* base that produces DIAGRAM_STATE_BASE_VERSION_REQUIRED.
    console.warn("restore base differs from current server version", { base: body.base_diagram_state_version, serverVersion });
  }
  if (!restoreResponse || restoreResponse.status >= 500) {
    throw new Error(`restore request failed: ${restoreResponse?.status}`);
  }

  const bodyText = await page.locator("body").textContent();
  if (bodyText.includes("требуется обновить состояние схемы")) {
    throw new Error("frontend showed base-version-required error");
  }

  console.log("ok: restore sent base_diagram_state_version", body.base_diagram_state_version, "response", restoreResponse.status);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
