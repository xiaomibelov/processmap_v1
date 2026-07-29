// E9.6 — screenshots of /technologist/pilots against vite dev :15177.
// API is mocked via page.route (demo backend restart is owner's responsibility);
// fixtures mirror the real backend payloads from docs/e9/*.json.
import { chromium } from "playwright";

const BASE = process.env.PILOTS_BASE_URL || "http://localhost:15177";
const OUT = "/root/pm-e3/app/docs/e9";

const KITCHENS = [
  { id: "k1", name: "Кухня №1 (центральная)", location: "Цех А", status: "active", equipment: [] },
  { id: "k2", name: "Кухня №2 (линия РТК)", location: "Цех Б", status: "active", equipment: [] },
  { id: "k3", name: "Кухня №3 (без датчиков)", location: "Цех В", status: "active", equipment: [] },
];

const BINDINGS = [
  {
    id: "bnd_pilot", recipe_id: "49165cc0-1412-4419-96c9-82f718aa4cdf", recipe_version: "1.0.0",
    kitchen_ids: ["k1"], pilot_kitchen_id: "k1", status: "pilot",
    pilot_exit_criteria_json: { min_orders: 20, max_critical_errors: 0, max_defect_rate_pct: 2 },
    valid_from: null, valid_to: null, created_by: "analyst@local",
  },
  {
    id: "bnd_active", recipe_id: "6951cce6-1b77-4569-929d-3e6135ec852b", recipe_version: "1.0.0",
    kitchen_ids: ["k1", "k2"], pilot_kitchen_id: "k1", status: "active",
    pilot_exit_criteria_json: { min_orders: 20 }, valid_from: null, valid_to: null, created_by: "analyst@local",
  },
  {
    id: "bnd_draft", recipe_id: "da3e8d03-f3b3-4f1f-8be8-c079f1372743", recipe_version: null,
    kitchen_ids: [], pilot_kitchen_id: null, status: "draft",
    pilot_exit_criteria_json: null, valid_from: null, valid_to: null, created_by: "analyst@local",
  },
];

const METRICS_BLOCKED = {
  binding_id: "bnd_pilot", status: "pilot", pilot_kitchen_id: "k1",
  criteria: { min_orders: 20, max_critical_errors: 0, max_defect_rate_pct: 2 },
  totals: { orders: 14, critical_errors: 0, defect_count: 0, defect_rate_pct: 1.2 },
  checks: [
    { key: "min_orders", label: "Заказы", current: 14, target: 20, met: false, text: "14/20" },
    { key: "max_critical_errors", label: "Критические ошибки", current: 0, target: 0, met: true, text: "0/0" },
    { key: "max_defect_rate_pct", label: "Брак", current: 1.2, target: 2, met: true, text: "1.2%/≤2%" },
  ],
  all_met: false,
  unmet: ["min_orders не выполнен: 14/20"],
  samples: [
    { id: "s1", binding_id: "bnd_pilot", ts: "2026-07-28T09:00:00", orders_count: 14, critical_errors: 0, defect_count: 0 },
  ],
};

const METRICS_MET = {
  ...METRICS_BLOCKED,
  totals: { orders: 20, critical_errors: 0, defect_count: 0, defect_rate_pct: 1.2 },
  checks: METRICS_BLOCKED.checks.map((c) =>
    c.key === "min_orders" ? { ...c, current: 20, met: true, text: "20/20" } : c,
  ),
  all_met: true,
  unmet: [],
};

function mockApi(page, metrics) {
  return page.route("**/api/**", (route) => {
    const url = route.request().url();
    const json = (payload, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    if (url.includes("/api/auth/me")) {
      return json({ id: "u1", email: "analyst@local", role: "analyst", is_admin: false, orgs: [], groups: [] });
    }
    if (url.includes("/api/sku-bindings/bnd_pilot/pilot-metrics")) return json(metrics);
    if (url.includes("/api/sku-bindings")) return json(BINDINGS);
    if (url.includes("/api/kitchens")) return json(KITCHENS);
    return json({});
  });
}

async function shoot(browser, metrics, file, { hoverRollout = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_auth_access_token", "e9-screenshot-token");
  });
  await mockApi(page, metrics);
  await page.goto(`${BASE}/technologist/pilots`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="pilot-card"]', { timeout: 15000 });
  if (hoverRollout) await page.hover('[data-testid="rollout-button"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  await page.close();
  console.log(`[screenshot] ${OUT}/${file}`);
}

const browser = await chromium.launch();
try {
  await shoot(browser, METRICS_BLOCKED, "screen_pilot_card_blocked.png", { hoverRollout: true });
  await shoot(browser, METRICS_MET, "screen_pilot_card_met.png");
  await shoot(browser, METRICS_BLOCKED, "screen_bindings_list.png");
} finally {
  await browser.close();
}
