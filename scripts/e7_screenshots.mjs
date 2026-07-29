// E7 — скриншоты: bpmn-js viewer + Constructor UI (publish/versions).
// Запуск: NODE_PATH=/root/node_modules node scripts/e7_screenshots.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "e7");
const VITE = process.env.E7_VITE || "http://127.0.0.1:15178";
const BACKEND = process.env.E7_BASE || "http://127.0.0.1:18091";
const DB_URL = process.env.DATABASE_URL || "postgresql://fpc:fpc@localhost:5432/processmap";

function py(script) {
  return execSync(`${path.join(ROOT, ".venv", "bin", "python")} -c "${script.replace(/"/g, '\\"')}"`, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
  }).toString().trim();
}

// временный analyst + токен; soup template id из БД
const setup = JSON.parse(py(`
import json, uuid, psycopg, sys
sys.path.insert(0, '.')
from backend.app.auth import create_access_token
uid = uuid.uuid4().hex
con = psycopg.connect('${DB_URL}')
con.execute("INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) VALUES (%s, %s, '', 1, 0, 'analyst', 0, 0)", (uid, f'e7_shot_{uid[:6]}@local'))
row = con.execute("SELECT id FROM process_template WHERE name = 'Супы РТК v1 (E7)' ORDER BY updated_at DESC LIMIT 1").fetchone()
con.commit(); con.close()
print(json.dumps({'uid': uid, 'token': create_access_token(uid), 'template_id': str(row[0])}))
`));

const browser = await chromium.launch();
try {
  // 1. bpmn-js render доказательство Camunda-совместимости
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${VITE}/bpmn-proof.html?src=/e7/soups_v1.0.0.bpmn`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__BPMN_RENDERED__ === true || window.__BPMN_ERROR__, null, { timeout: 30000 });
  const bpmnError = await page.evaluate(() => window.__BPMN_ERROR__ || null);
  if (bpmnError) throw new Error(`bpmn-js import failed: ${bpmnError}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "screen_bpmn_viewer.png"), fullPage: false });
  console.log("[shot] screen_bpmn_viewer.png");

  // 2. Constructor UI: published шаблон — кнопки «Новый черновик»/«Скачать BPMN» + versions panel
  const ui = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await ui.addInitScript((token) => {
    window.localStorage.setItem("fpc_auth_access_token", token);
  }, setup.token);
  await ui.goto(`${VITE}/technologist/constructor?template=${setup.template_id}`, { waitUntil: "networkidle" });
  await ui.waitForSelector('[data-testid="template-download-bpmn"]', { timeout: 30000 });
  await ui.waitForTimeout(1200);
  await ui.screenshot({ path: path.join(OUT, "screen_constructor_published.png"), fullPage: false });
  console.log("[shot] screen_constructor_published.png");

  // versions panel крупным планом
  const panel = await ui.$('[data-testid="versions-panel"]');
  if (panel) {
    await panel.screenshot({ path: path.join(OUT, "screen_versions_panel.png") });
    console.log("[shot] screen_versions_panel.png");
  }
} finally {
  await browser.close();
  py(`
import psycopg
con = psycopg.connect('${DB_URL}')
con.execute("DELETE FROM users WHERE id = '${setup.uid}'")
con.commit(); con.close()
print('cleanup ok')
`);
}
