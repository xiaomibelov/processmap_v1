import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("save ack toast uses bottom-center placement and updated accent tone", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessSaveAckToast.jsx"), "utf8");
  assert.equal(source.includes("fixed bottom-5 left-1/2"), true);
  assert.equal(source.includes("-translate-x-1/2"), true);
  assert.equal(source.includes("top-16"), false);
  assert.equal(source.includes("bg-cyan-500/18"), true);
});
