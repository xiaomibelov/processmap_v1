import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("revision dialogs use RU labels for metadata surface", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessDialogs.jsx"), "utf8");
  assert.equal(source.includes("Последние версии:"), true);
  assert.equal(source.includes("последняя"), true);
  assert.equal(source.includes("черновик"), true);
  assert.equal(source.includes("автор:"), true);
  assert.equal(source.includes("комментарий:"), true);
  assert.equal(source.includes("хэш:"), true);
  assert.equal(source.includes("размер:"), true);
});
