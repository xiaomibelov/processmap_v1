import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(
  path.join(__dirname, "features/process/bpmn/stage/optimisticUpdate/useSessionStatusOptimisticUpdate.js"),
  "utf8",
);

function extractFunction(src, name) {
  const start = src.indexOf(`const ${name} = useCallback(async`);
  if (start === -1) return "";
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return src.slice(start, end);
}

const fnText = extractFunction(source, "changeCurrentSessionStatus");

test("changeCurrentSessionStatus reads base diagram state version from draft", () => {
  assert.equal(
    fnText.includes("draft?.diagram_state_version ?? draft?.diagramStateVersion"),
    true,
    "should read diagram_state_version from draft",
  );
});

test("changeCurrentSessionStatus falls back to apiGetSession when draft version is missing", () => {
  assert.equal(fnText.includes("apiGetSession(sid)"), true);
  assert.equal(
    /snapshot\?\.session\?\.diagram_state_version|\bsnapshot\?\.session\?\.diagramStateVersion/.test(fnText),
    true,
  );
});

test("changeCurrentSessionStatus includes base_diagram_state_version in payload", () => {
  assert.equal(fnText.includes("base_diagram_state_version"), true);
});

test("changeCurrentSessionStatus calls apiChangeSessionStatus", () => {
  assert.equal(fnText.includes("apiChangeSessionStatus(sid, payload)"), true);
});

test("changeCurrentSessionStatus rounds finite base diagram state version", () => {
  assert.equal(fnText.includes("Math.round(baseDiagramStateVersion)"), true);
});
