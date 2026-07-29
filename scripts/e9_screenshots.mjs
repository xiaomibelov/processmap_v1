// E9 — скриншоты /technologist/pilots на РЕАЛЬНОМ демо-окружении (:15177→:18011).
// Сценарий через API: binding → start-pilot (min_orders 20) → 14 заказов
// (кнопка «Раскатать» disabled с причиной) → 20 заказов (enabled).
// Запуск: NODE_PATH=/root/node_modules node scripts/e9_screenshots.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "e9");
const VITE = process.env.E9_VITE || "http://127.0.0.1:15177";
const API = process.env.E9_API || "http://127.0.0.1:18011";
const DB_URL = process.env.DATABASE_URL || "postgresql://fpc:fpc@localhost:5432/processmap";
const RECIPE_ID = "71999a11-56fa-4d6b-a6d9-930bbf5a58fa"; // e8_audit_soup, published 1.0.1
const KITCHEN = "4369f4db-7976-45b7-91a8-a83c0f8ad131"; // Кухня №1

function py(script) {
  return execSync(`${path.join(ROOT, ".venv", "bin", "python")} -c "${script.replace(/"/g, '\\"')}"`, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
  }).toString().trim();
}

const setup = JSON.parse(py(`
import json, uuid, psycopg, sys
sys.path.insert(0, '.')
from backend.app.auth import create_access_token
uid = uuid.uuid4().hex
con = psycopg.connect('${DB_URL}')
con.execute("INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) VALUES (%s, %s, '', 1, 0, 'analyst', 0, 0)", (uid, f'e9_shot_{uid[:6]}@local'))
con.commit(); con.close()
print(json.dumps({'uid': uid, 'token': create_access_token(uid)}))
`));

const H = { Authorization: `Bearer ${setup.token}`, "Content-Type": "application/json" };
async function api(method, url, body) {
  const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status}: ${text}`);
  return JSON.parse(text);
}

// реальные операции: binding → pilot → 14/20
const binding = await api("POST", "/api/sku-bindings", { recipe_id: RECIPE_ID, recipe_version: "1.0.1", kitchen_ids: [KITCHEN] });
console.log("[e9] binding:", binding.id);
await api("POST", `/api/sku-bindings/${binding.id}/start-pilot`, {
  pilot_kitchen_id: KITCHEN,
  criteria: { min_orders: 20, max_critical_errors: 0, max_defect_rate_pct: 2 },
});
await api("POST", `/api/sku-bindings/${binding.id}/metrics`, { orders_count: 14, critical_errors: 0, defect_count: 0 });
const blocked = await api("GET", `/api/sku-bindings/${binding.id}/pilot-metrics`);
console.log("[e9] metrics 14/20, all_met =", blocked.all_met);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), setup.token);
  await page.goto(`${VITE}/technologist/pilots`, { waitUntil: "networkidle" });
  await page.waitForSelector(`[data-testid="binding-item-${binding.id}"]`, { timeout: 30000 });
  await page.click(`[data-testid="binding-item-${binding.id}"]`);
  await page.waitForSelector('[data-testid="pilot-card"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "screen_pilots_list.png") });
  console.log("[shot] screen_pilots_list.png");

  const card = await page.$('[data-testid="pilot-card"]');
  await card.screenshot({ path: path.join(OUT, "screen_pilot_card_blocked.png") });
  console.log("[shot] screen_pilot_card_blocked.png (14/20, rollout disabled)");

  // добиваем до 20/20 → кнопка активна (метрики грузятся на mount карточки — reload)
  await api("POST", `/api/sku-bindings/${binding.id}/metrics`, { orders_count: 6, critical_errors: 0, defect_count: 0 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(`[data-testid="binding-item-${binding.id}"]`, { timeout: 30000 });
  await page.click(`[data-testid="binding-item-${binding.id}"]`);
  await page.waitForSelector('[data-testid="pilot-check-min_orders"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  const card2 = await page.$('[data-testid="pilot-card"]');
  await card2.screenshot({ path: path.join(OUT, "screen_pilot_card_met.png") });
  console.log("[shot] screen_pilot_card_met.png (20/20, rollout enabled)");
} finally {
  await browser.close();
}
