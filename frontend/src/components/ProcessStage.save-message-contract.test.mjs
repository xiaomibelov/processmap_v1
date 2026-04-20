import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("manual save no-op message uses saved-within-version wording instead of legacy already-saved phrase", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("Сессия уже сохранена: изменений схемы нет."), false);
  assert.equal(source.includes("Сохранено внутри версии."), true);
});
