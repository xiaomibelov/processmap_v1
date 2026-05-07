import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_ROOT = __dirname;

function readAdminFile(relPath) {
  return fs.readFileSync(path.join(ADMIN_ROOT, relPath), "utf8");
}

test("admin ai modules section is visible in admin navigation and route metadata", () => {
  const routes = readAdminFile("constants/adminRoutes.constants.js");
  const nav = readAdminFile("constants/adminNav.js");
  const utils = readAdminFile("adminUtils.js");
  const app = readAdminFile("AdminApp.jsx");

  assert.match(routes, /aiModules:\s*"ai-modules"/);
  assert.match(routes, /path:\s*"\/admin\/ai-modules"/);
  assert.match(nav, /label:\s*ru\.admin\.nav\.aiModules/);
  assert.match(utils, /"ai-modules":\s*ru\.admin\.sections\.aiModules/);
  assert.match(app, /route\.section === "ai-modules"/);
  assert.match(app, /<AdminAiModulesPage \/>/);
});
