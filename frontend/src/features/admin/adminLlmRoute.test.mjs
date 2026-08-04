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

test("admin llm section is visible in admin navigation and route metadata", () => {
  const routes = readAdminFile("constants/adminRoutes.constants.js");
  const nav = readAdminFile("constants/adminNav.js");
  const utils = readAdminFile("adminUtils.js");
  const app = readAdminFile("AdminApp.jsx");

  assert.match(routes, /llm:\s*"llm"/);
  assert.match(routes, /path:\s*"\/admin\/llm"/);
  assert.match(nav, /label:\s*ru\.admin\.nav\.llm/);
  assert.match(utils, /llm:\s*ru\.admin\.sections\.llm/);
  assert.match(app, /route\.section === "llm"/);
  assert.match(app, /<AdminLlmPage \/>/);
});

test("admin llm API routes and wrappers are exposed", () => {
  const apiRoutes = readAdminFile("../../lib/apiRoutes.js");
  const apiModules = readAdminFile("../../lib/apiModules/adminApi.js");
  const featureApi = readAdminFile("api/adminApi.js");

  assert.match(apiRoutes, /llmProviders:\s*\(\)\s*=>\s*"\/api\/admin\/llm\/providers"/);
  assert.match(apiRoutes, /llmProvider:\s*\(id\)\s*=>/);
  assert.match(apiRoutes, /llmProviderTest:\s*\(id\)\s*=>/);
  assert.match(apiRoutes, /llmPrompts:\s*\(params = \{\}\)\s*=>\s*withQuery\("\/api\/admin\/llm\/prompts"/);
  assert.match(apiRoutes, /llmPromptActivate:\s*\(id\)\s*=>/);
  assert.match(apiRoutes, /llmPromptRollback:\s*\(id\)\s*=>/);
  assert.match(apiRoutes, /llmFeatures:\s*\(\)\s*=>\s*"\/api\/admin\/llm\/features"/);
  assert.match(apiRoutes, /llmFeature:\s*\(feature\)\s*=>/);
  assert.match(apiRoutes, /llmUsage:\s*\(params = \{\}\)\s*=>\s*withQuery\("\/api\/admin\/llm\/usage"/);

  const wrappers = [
    "apiAdminLlmListProviders",
    "apiAdminLlmCreateProvider",
    "apiAdminLlmPatchProvider",
    "apiAdminLlmDeleteProvider",
    "apiAdminLlmTestProvider",
    "apiAdminLlmListPrompts",
    "apiAdminLlmCreatePrompt",
    "apiAdminLlmActivatePrompt",
    "apiAdminLlmRollbackPrompt",
    "apiAdminLlmListFeatures",
    "apiAdminLlmPatchFeature",
    "apiAdminLlmUsage",
  ];
  wrappers.forEach((name) => {
    assert.ok(apiModules.includes(`export async function ${name}(`), `missing wrapper ${name} in lib/apiModules/adminApi.js`);
    assert.ok(featureApi.includes(name), `missing re-export ${name} in features/admin/api/adminApi.js`);
  });
});
