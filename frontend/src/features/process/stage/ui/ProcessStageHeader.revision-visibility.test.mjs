import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("revision badges are rendered only when session is active", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  const guardIdx = source.indexOf("{hasSession ? (");
  const noRevisionIdx = source.indexOf("Ревизий нет");
  const publishedIdx = source.indexOf("Опубликовано");
  assert.ok(guardIdx !== -1, "hasSession visibility guard must exist");
  assert.ok(noRevisionIdx !== -1, "fallback revision label must exist");
  assert.ok(publishedIdx !== -1, "published revision label must exist");
});
