// E8 — скриншоты: вкладка «История» рецепта + поимённый diff версий.
// Реальное демо-окружение :15177 → :18011, рецепт из docs/e8/artifact_context.json.
// Запуск: NODE_PATH=/root/node_modules node scripts/e8_screenshots.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "e8");
const VITE = process.env.E8_VITE || "http://127.0.0.1:15177";
const DB_URL = process.env.DATABASE_URL || "postgresql://fpc:fpc@localhost:5432/processmap";

const ctx = JSON.parse(fs.readFileSync(path.join(OUT, "artifact_context.json"), "utf8"));

function py(script) {
  return execSync(`${path.join(ROOT, ".venv", "bin", "python")} -c "${script.replace(/"/g, '\\"')}"`, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
  }).toString().trim();
}

// viewer-токен (тот же actor — он жив в БД)
const token = py(`
import sys
sys.path.insert(0, '.')
from backend.app.auth import create_access_token
print(create_access_token('${ctx.actor_id}'))
`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await page.addInitScript((t) => {
    window.localStorage.setItem("fpc_auth_access_token", t);
  }, token);
  await page.goto(`${VITE}/technologist/recipes`, { waitUntil: "networkidle" });
  await page.waitForSelector(`[data-testid="recipe-item-${ctx.recipe_id}"]`, { timeout: 30000 });
  await page.click(`[data-testid="recipe-item-${ctx.recipe_id}"]`);
  await page.click('[data-testid="tab-history"]');
  await page.waitForSelector('[data-testid="history-tab"] [data-testid="audit-list"]', { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, "screen_history_tab.png") });
  console.log("[shot] screen_history_tab.png");

  const diff = await page.$('[data-testid="version-diff"]');
  if (diff) {
    await diff.screenshot({ path: path.join(OUT, "screen_history_diff.png") });
    console.log("[shot] screen_history_diff.png");
  } else {
    throw new Error("version-diff block not found");
  }
} finally {
  await browser.close();
}
