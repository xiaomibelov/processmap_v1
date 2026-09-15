// Регрессионный бюджет холодной загрузки (mission item 5 контура
// fix/post-step1-load-regression): post-deploy investigation зафиксировала
// systemic load degradation в deploy-окне; этот spec — сторож бюджетов
// холодной загрузки /projects, чтобы повторное проявление ловилось e2e.
//
// Бюджеты (cold load):
//   - document TTFB (navigation.responseStart) < 2 s;
//   - полный load (navigation.duration → loadEventEnd) < 10 s;
//   - ни один ресурс не качается дольше 5 s и не остаётся pending.
//   - две последовательные загрузки: вторая (warm) обязана быть быстрее.
//
// Прогонять ТОЛЬКО против реального origin (stage: E2E_APP_BASE_URL=
// https://stage.processmap.ru) — spec фейлит fast, если базой оказался
// localhost/127.0.0.1: бюджеты про холодную загрузку через nginx/gateway
// локально не воспроизводятся.
//
// Статус: parse-only (node --check / playwright --list). Исполнение — вне
// этого контура (стек поднимается отдельно).

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const APP_BASE = String(process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177").trim().replace(/\/+$/, "");

const BUDGET = Object.freeze({
  ttfbMs: 2000,
  loadMs: 10_000,
  maxResourceMs: 5000,
});

function assertRealOrigin(origin) {
  const hostname = (() => {
    try {
      return new URL(String(origin || "")).hostname || "";
    } catch {
      return "";
    }
  })();
  expect(
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(hostname),
    `cold-load budgets must be asserted against the real origin (E2E_APP_BASE_URL), got ${origin} — point it at stage`,
  ).toBe(false);
}

async function readLoadBudgets(page) {
  return page.evaluate(() => {
    const navigations = performance.getEntriesByType("navigation");
    const nav = navigations[navigations.length - 1] || null;
    const navStart = nav ? nav.startTime : 0;
    const resources = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.startTime >= navStart);
    return {
      origin: window.location.origin,
      path: window.location.pathname,
      ttfbMs: nav ? Math.round(nav.responseStart) : null,
      loadMs: nav ? Math.round(nav.duration) : null,
      slowResources: resources
        .filter((entry) => entry.responseEnd > 0 && entry.responseEnd - entry.startTime > 5000)
        .map((entry) => ({ name: entry.name, durationMs: Math.round(entry.responseEnd - entry.startTime) })),
      pendingResources: resources
        .filter((entry) => entry.responseEnd === 0)
        .map((entry) => entry.name),
    };
  });
}

function expectWithinBudgets(budgets, label) {
  expect(budgets.ttfbMs, `${label}: document TTFB ${budgets.ttfbMs}ms must be < ${BUDGET.ttfbMs}ms`).toBeLessThan(BUDGET.ttfbMs);
  expect(budgets.loadMs, `${label}: full load ${budgets.loadMs}ms must be < ${BUDGET.loadMs}ms`).toBeLessThan(BUDGET.loadMs);
  expect(
    budgets.slowResources,
    `${label}: no resource may take > ${BUDGET.maxResourceMs}ms (got ${JSON.stringify(budgets.slowResources)})`,
  ).toEqual([]);
  expect(
    budgets.pendingResources,
    `${label}: no resource may be left pending (got ${JSON.stringify(budgets.pendingResources)})`,
  ).toEqual([]);
}

test("cold load /projects unauthenticated: redirect to login within budgets", async ({ page }) => {
  await page.goto("/projects", { waitUntil: "load", timeout: BUDGET.loadMs * 3 });
  await expect(page).toHaveURL(/\/\?next=/, { timeout: BUDGET.ttfbMs * 5 });

  const budgets = await readLoadBudgets(page);
  assertRealOrigin(budgets.origin);
  expect(budgets.origin).toBe(new URL(APP_BASE).origin);
  expectWithinBudgets(budgets, "unauthenticated cold load");
});

test("cold → warm load /projects (authenticated) within budgets, warm faster", async ({ page, request }) => {
  const auth = await apiLogin(request);
  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });

  await page.goto("/projects", { waitUntil: "load", timeout: BUDGET.loadMs * 3 });
  await expect(page).toHaveURL(/\/projects/, { timeout: BUDGET.ttfbMs * 5 });
  const cold = await readLoadBudgets(page);
  assertRealOrigin(cold.origin);
  expect(cold.origin).toBe(new URL(APP_BASE).origin);
  expectWithinBudgets(cold, "authenticated cold load");

  // Вторая загрузка того же origin (warm: DNS/TLS/кэш статики прогреты).
  await page.goto("/projects", { waitUntil: "load", timeout: BUDGET.loadMs * 3 });
  const warm = await readLoadBudgets(page);
  assertRealOrigin(warm.origin);
  expect(warm.origin).toBe(new URL(APP_BASE).origin);
  expectWithinBudgets(warm, "authenticated warm load");

  expect(
    warm.ttfbMs < cold.ttfbMs || warm.loadMs < cold.loadMs,
    `warm load (${warm.ttfbMs}ms TTFB / ${warm.loadMs}ms load) must be faster than cold (${cold.ttfbMs}ms / ${cold.loadMs}ms)`,
  ).toBe(true);
});
