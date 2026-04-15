import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useSessionMetaWriteGateway.js"), "utf8");
}

test("session meta gateway includes base_diagram_state_version in default patch payload", () => {
  const source = readSource();
  assert.equal(
    source.includes("payload.base_diagram_state_version = Math.round(baseVersion);"),
    true,
  );
  assert.equal(
    source.includes("baseDiagramStateVersion,"),
    true,
  );
  assert.equal(
    source.includes("if (fromOptionNormalized <= 0 && fromGatewayNormalized > 0) return fromGatewayNormalized;"),
    true,
  );
  assert.equal(
    source.includes("return Math.max(fromOptionNormalized, fromGatewayNormalized);"),
    true,
  );
});
