import { expect, test } from "@playwright/test";

function responsePath(urlString) {
  try {
    return new URL(urlString).pathname;
  } catch {
    return "";
  }
}

test("TopBar: Новый проект и Создать сессию отправляют POST и открывают процесс", async ({ page }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const projectTitle = `E2E UI Project ${runId}`;
  const sessionTitle = `E2E UI Session ${runId}`;

  await page.goto("/");
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Новый проект" })).toBeVisible();

  await page.getByRole("button", { name: "Новый проект" }).click();
  const projectModal = page.locator(".modalOverlay");
  await expect(projectModal).toBeVisible();
  await expect(page.locator(".modalTitle")).toContainText("Создание проекта");

  const modalGeom = await projectModal.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const st = window.getComputedStyle(el);
    return {
      x: Math.round(Number(r.x || 0)),
      y: Math.round(Number(r.y || 0)),
      w: Math.round(Number(r.width || 0)),
      h: Math.round(Number(r.height || 0)),
      position: st.position,
      zIndex: st.zIndex,
    };
  });
  expect(modalGeom.position).toBe("fixed");
  expect(modalGeom.y).toBe(0);
  expect(modalGeom.w).toBeGreaterThan(400);
  expect(modalGeom.h).toBeGreaterThan(300);
  expect(Number(modalGeom.zIndex || 0)).toBeGreaterThan(20);

  await page.locator(".modalBody .field .input").first().fill(projectTitle);

  const createProjectReq = page.waitForRequest(
    (req) => req.method() === "POST" && responsePath(req.url()) === "/api/projects",
  );
  const createProjectRes = page.waitForResponse(
    (res) => res.request().method() === "POST" && responsePath(res.url()) === "/api/projects",
  );
  const createSessionReq = page.waitForRequest(
    (req) => req.method() === "POST" && /\/api\/projects\/[^/]+\/sessions$/.test(responsePath(req.url())),
  );
  const createSessionRes = page.waitForResponse(
    (res) => res.request().method() === "POST" && /\/api\/projects\/[^/]+\/sessions$/.test(responsePath(res.url())),
  );

  await page.locator(".modalFooter").getByRole("button", { name: /^Создать$/ }).click();

  await createProjectReq;
  const projectResponse = await createProjectRes;
  expect(projectResponse.ok()).toBeTruthy();
  await createSessionReq;
  const sessionResponse = await createSessionRes;
  expect(sessionResponse.ok()).toBeTruthy();

  await expect(projectModal).toHaveCount(0);
  await expect(page.locator("select.topSelect--project")).toHaveValue(/.+/);
  await expect(page.locator("select.topSelect--project option", { hasText: projectTitle })).toHaveCount(1);
  await expect(page.locator("select.topSelect--session")).toHaveValue(/.+/);

  await expect(page.getByRole("button", { name: "Создать сессию" })).toBeEnabled();
  await page.getByRole("button", { name: "Создать сессию" }).click();
  await expect(page.locator(".modalOverlay")).toBeVisible();
  await expect(page.locator(".modalTitle")).toContainText("Создание сессии");

  await page.locator(".sessionFlowTitleRow .input").first().fill(sessionTitle);
  const createSessionReq2 = page.waitForRequest(
    (req) => req.method() === "POST" && /\/api\/projects\/[^/]+\/sessions$/.test(responsePath(req.url())),
  );
  const createSessionRes2 = page.waitForResponse(
    (res) => res.request().method() === "POST" && /\/api\/projects\/[^/]+\/sessions$/.test(responsePath(res.url())),
  );
  await page.locator(".modalFooter").getByRole("button", { name: "Создать и начать интервью" }).click();
  await createSessionReq2;
  const createdSessionResponse = await createSessionRes2;
  expect(createdSessionResponse.ok()).toBeTruthy();
  const createdSessionBody = await createdSessionResponse.json();
  const createdSessionId = String(createdSessionBody?.id || createdSessionBody?.session_id || "").trim();
  expect(createdSessionId).not.toBe("");

  await expect(page.locator(".modalOverlay")).toHaveCount(0);
  await expect(page.locator(`select.topSelect--session option[value="${createdSessionId}"]`)).toHaveCount(1);
  await expect(page.locator("select.topSelect--session")).toHaveValue(createdSessionId);
});
