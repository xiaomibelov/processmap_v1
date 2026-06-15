import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

function hasChangeCurrentSessionStatusFunction(src) {
  const start = src.indexOf("async function changeCurrentSessionStatus");
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

const fnText = hasChangeCurrentSessionStatusFunction(source);

test("changeCurrentSessionStatus reads base diagram state version from draft", () => {
  assert.equal(
    fnText.includes("draft?.diagram_state_version ?? draft?.diagramStateVersion"),
    true,
    "should read diagram_state_version from draft",
  );
});

test("changeCurrentSessionStatus includes base_diagram_state_version in patch payload", () => {
  assert.equal(
    fnText.includes("base_diagram_state_version"),
    true,
    "should include base_diagram_state_version key",
  );
  assert.equal(
    fnText.includes("apiPatchSession(sid, payload)"),
    true,
    "should call apiPatchSession with payload object",
  );
});

test("changeCurrentSessionStatus rounds finite base diagram state version", () => {
  assert.equal(
    fnText.includes("Math.round(baseDiagramStateVersion)"),
    true,
    "should round base diagram state version",
  );
});
