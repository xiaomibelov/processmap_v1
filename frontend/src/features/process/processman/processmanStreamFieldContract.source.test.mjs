import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function resolveSchemaPath() {
  // Normal case: running from repo root or repo/frontend (cwd below repo root).
  // 5 ".." from frontend/src/features/process/processman reach repo root.
  const relative = join(here, "../../../../../backend/services/agent/schemas.py");
  if (existsSync(relative)) return relative;
  // Fallback: running with only the frontend tree mounted as /app (Docker dev helper).
  // 6 ".." reach the parent of frontend; if backend is sibling it will resolve.
  const fallback = join(here, "../../../../../../backend/services/agent/schemas.py");
  if (existsSync(fallback)) return fallback;
  return null;
}

const schemaPath = resolveSchemaPath();
const tobePath = new URL("./ProcessmanTobe.jsx", import.meta.url);
const tobeSource = readFileSync(tobePath, "utf8");

function extractAgentChatInFields(source) {
  // Match class AgentChatIn and its body until the next class definition.
  const match = source.match(/class AgentChatIn\(BaseModel\):([\s\S]*?)(?=\nclass |\n\nclass |\n\n\n|$)/);
  assert.ok(match, "AgentChatIn class not found in backend/services/agent/schemas.py");
  const body = match[1];
  const fields = new Set();
  const lineRe = /^\s*(\w+)\s*:\s*\w+/gm;
  let m;
  while ((m = lineRe.exec(body)) !== null) {
    fields.add(m[1]);
  }
  return fields;
}

function extractApiAgentStreamFields(source) {
  // Match the apiAgentStream call and capture its first object literal argument.
  const callMatch = source.match(/apiAgentStream\s*\(\s*[^,]+,\s*\{([\s\S]*?)\}\s*,/);
  assert.ok(callMatch, "apiAgentStream call-site not found in ProcessmanTobe.jsx");
  const body = callMatch[1];
  const fields = new Set();
  for (const part of body.split(",")) {
    const line = part.split("//")[0].trim();
    if (!line || line.startsWith("...")) continue;
    if (line.includes(":")) {
      fields.add(line.split(":", 1)[0].trim());
    }
  }
  return fields;
}

if (!schemaPath) {
  test.skip(
    "backend/services/agent/schemas.py not reachable from this mount — run with repo root mounted",
    () => {}
  );
} else {
  const schemaSource = readFileSync(schemaPath, "utf8");

  test("AgentChatIn fields are known", () => {
    const fields = extractAgentChatInFields(schemaSource);
    assert.ok(fields.has("message"), "AgentChatIn must declare 'message'");
    assert.ok(fields.has("selected_step_id"), "AgentChatIn must declare 'selected_step_id'");
  });

  test("ProcessmanTobe sends only AgentChatIn fields to /agent/stream", () => {
    const schemaFields = extractAgentChatInFields(schemaSource);
    const frontendFields = extractApiAgentStreamFields(tobeSource);
    const unknown = [...frontendFields].filter((f) => !schemaFields.has(f));
    assert.deepStrictEqual(
      unknown,
      [],
      `ProcessmanTobe.jsx sends unknown fields to /agent/stream: ${unknown.join(", ")}. ` +
        `AgentChatIn fields: ${[...schemaFields].join(", ")}`
    );
  });

  test("ProcessmanTobe sends required AgentChatIn fields", () => {
    const frontendFields = extractApiAgentStreamFields(tobeSource);
    assert.ok(frontendFields.has("message"), "frontend must send 'message'");
    assert.ok(frontendFields.has("selected_step_id"), "frontend must send 'selected_step_id'");
  });

  test("AgentChatIn rejects extra fields (extra='forbid')", () => {
    assert.match(schemaSource, /model_config\s*=\s*\{\s*"extra"\s*:\s*"forbid"\s*\}/);
  });
}
