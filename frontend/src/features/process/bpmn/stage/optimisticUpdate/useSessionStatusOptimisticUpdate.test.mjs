import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, "useSessionStatusOptimisticUpdate.js"), "utf8");

test("useSessionStatusOptimisticUpdate imports apiChangeSessionStatus", () => {
  assert.match(source, /import\s+\{[^}]*apiChangeSessionStatus[^}]*\}\s+from\s+"\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/api\.js"/);
});

test("changeCurrentSessionStatus snapshots previous status values", () => {
  assert.match(
    source,
    /statusChangeSnapshotRef\.current\s*=\s*\{\s*interviewStatus:\s*previousInterviewStatus,\s*directStatus:\s*previousDirectStatus\s*\}/,
  );
});

test("changeCurrentSessionStatus applies optimistic status update", () => {
  assert.match(source, /next\.interview\s*=\s*next\.interview\s*&&\s*typeof\s+next\.interview\s*===\s*"object"\s*\?\s*\{\s*\.\.\.next\.interview,\s*status\s*\}\s*:\s*\{\s*status\s*\}/);
  assert.match(source, /next\.status\s*=\s*status;/);
});

test("changeCurrentSessionStatus rolls back on failure", () => {
  assert.match(source, /if\s*\(\s*!r\.ok\s*\)\s*\{[\s\S]*?setDraftPersisted\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{\s*const\s+next\s*=\s*\{\s*\.\.\.prev\s*\}/s);
  assert.match(source, /if\s*\(\s*snap\.interviewStatus\s*!==\s*undefined\s*\)\s*next\.interview\.status\s*=\s*snap\.interviewStatus;/);
  assert.match(source, /else\s+delete\s+next\.interview\.status;/);
});

test("changeCurrentSessionStatus shows Russian 409 message", () => {
  assert.match(
    source,
    /if\s*\(\s*r\.status\s*===\s*409\s*\)\s*\{\s*markFail\s*\(\s*"Переход в выбранный статус недоступен для текущего состояния сессии\."\s*\)/,
  );
});
