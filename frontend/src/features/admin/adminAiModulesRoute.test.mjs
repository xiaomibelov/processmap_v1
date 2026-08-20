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

test("admin ai-modules redirects to /admin/llm and is removed from top nav", () => {
  const nav = readAdminFile("constants/adminNav.js");
  const app = readAdminFile("AdminApp.jsx");
  const page = readAdminFile("pages/AdminAiModulesPage.jsx");

  assert.doesNotMatch(nav, /label:\s*ru\.admin\.nav\.aiModules/);
  assert.match(page, /\/admin\/llm\?tab=modules/);
  assert.match(app, /route\.section === "ai-modules"[\s\S]*<AdminAiModulesPage onNavigate=\{onNavigate\} \/>/);
});
