// Auth-guard: transient 5xx на bootstrap НЕ должен выбрасывать пользователя
// на /?next= (fix/stage-slow-load-auth-outage).
//
// Доказательная база инцидента stage 2026-09-15: окно 18:51–18:54 UTC —
// nginx отдавал 502 на /api/auth/me (OOM rag-embedder на хосте 4 ГБ), guard
// трактовал это как «неавторизован» и редиректил на /?next=%2Fapp.
//
// Сценарии:
//   1. me вернул 502 ОДИН раз -> повторная попытка -> пользователь остаётся
//      на /app (0 редиректов на /?next=);
//   2. N перезагрузок подряд при живом бэкенде -> 0 редиректов
//      (N = E2E_RELOAD_COUNT, default 5; приёмка контура — 20);
//   3. persistent 502 на me+refresh -> guard всё же уходит на /?next=
//      (бэкенд реально мёртв — редирект допустим).
//
// Прогон: E2E_APP_BASE_URL=https://stage.processmap.ru E2E_API_BASE_URL=https://stage.processmap.ru
//   npx playwright test e2e/auth-guard-transient-502.spec.mjs

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const APP_BASE = String(process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177").trim().replace(/\/+$/, "");
const RELOAD_COUNT = Math.max(1, Number(process.env.E2E_RELOAD_COUNT || 5));

function currentPath(page) {
  try {
    return new URL(page.url()).pathname || "/";
  } catch {
    return "/";
  }
}

function hasNextRedirect(page) {
  try {
    return new URL(page.url()).searchParams.get("next") !== null;
  } catch {
    return false;
  }
}

test.describe("auth-guard: transient 502", () => {
  test("me 502 один раз -> пользователь остаётся на /app", async ({ page, request }) => {
    const auth = await apiLogin(request, { appBase: APP_BASE });
    await setUiToken(page, auth.accessToken, {
      activeOrgId: auth.activeOrgId,
      refreshToken: auth.refreshToken,
      refreshCookie: auth.refreshCookie,
      appBaseUrl: APP_BASE,
    });

    let meCalls = 0;
    await page.route("**/api/auth/me", async (route) => {
      meCalls += 1;
      if (meCalls === 1) {
        await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ detail: "injected 502 (test)" }) });
        return;
      }
      await route.continue();
    });

    await page.goto(`${APP_BASE}/app`, { waitUntil: "domcontentloaded" });
    // Ждём bootstrap guard'а: либо контент workspace, либо редирект.
    await page.waitForTimeout(4000);
    expect(hasNextRedirect(page), `ожидались на /app, попали на ${page.url()}`).toBe(false);
    expect(currentPath(page)).toMatch(/^\/app/);
  });

  test(`${RELOAD_COUNT} перезагрузок подряд -> 0 редиректов на /?next=`, async ({ page, request }) => {
    const auth = await apiLogin(request, { appBase: APP_BASE });
    await setUiToken(page, auth.accessToken, {
      activeOrgId: auth.activeOrgId,
      refreshToken: auth.refreshToken,
      refreshCookie: auth.refreshCookie,
      appBaseUrl: APP_BASE,
    });

    await page.goto(`${APP_BASE}/app`, { waitUntil: "domcontentloaded" });
    let redirects = 0;
    for (let i = 0; i < RELOAD_COUNT; i += 1) {
      await page.waitForTimeout(1500);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      if (hasNextRedirect(page)) redirects += 1;
    }
    expect(redirects, `редиректов на /?next=: ${redirects} из ${RELOAD_COUNT}`).toBe(0);
  });

  test("persistent 502 на me+refresh -> редирект на /?next= допустим", async ({ page, request }) => {
    const auth = await apiLogin(request, { appBase: APP_BASE });
    await setUiToken(page, auth.accessToken, {
      activeOrgId: auth.activeOrgId,
      refreshToken: auth.refreshToken,
      refreshCookie: auth.refreshCookie,
      appBaseUrl: APP_BASE,
    });

    const fail = async (route) => route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ detail: "injected persistent 502 (test)" }),
    });
    await page.route("**/api/auth/me", fail);
    await page.route("**/api/auth/refresh", fail);

    await page.goto(`${APP_BASE}/app`, { waitUntil: "domcontentloaded" });
    // me: 3 попытки * 500ms + refresh: 3 попытки * 500ms -> редирект после ~3s.
    await page.waitForTimeout(7000);
    expect(hasNextRedirect(page), `persistent 502 должен приводить к /?next=, url=${page.url()}`).toBe(true);
  });
});
