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
  assert.equal(source.includes("enqueueSessionPatchCasWrite({"), true);
  assert.equal(source.includes("rememberDiagramStateVersion,"), true);
  assert.equal(
    source.includes("if (fromOptionNormalized <= 0 && fromGatewayNormalized > 0) return fromGatewayNormalized;"),
    true,
  );
  assert.equal(
    source.includes("return Math.max(fromOptionNormalized, fromGatewayNormalized);"),
    true,
  );
});

test("session meta gateway resolves CAS base immediately before each queued remote write", () => {
  const source = readSource();
  const runWriteIdx = source.indexOf("const runWrite = async () => {");
  const resolveInsideRunIdx = source.indexOf("const baseDiagramStateVersion = resolveBaseDiagramStateVersion();", runWriteIdx);
  const remoteWriteIdx = source.indexOf("const syncRes = await remoteWrite({", runWriteIdx);

  assert.notEqual(runWriteIdx, -1);
  assert.notEqual(resolveInsideRunIdx, -1);
  assert.notEqual(remoteWriteIdx, -1);
  assert.ok(resolveInsideRunIdx > runWriteIdx);
  assert.ok(resolveInsideRunIdx < remoteWriteIdx);
});
