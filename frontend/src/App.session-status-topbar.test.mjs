import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("App wires topbar status from draft.interview status resolver", () => {
  const source = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
  assert.equal(source.includes("resolveSessionStatusFromDraft"), true);
  assert.equal(source.includes("sessionStatus={resolveSessionStatusFromDraft(draft, \"draft\")}"), true);
});
