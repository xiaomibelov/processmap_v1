import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

test("App wires topbar status from draft.interview status resolver", () => {
  assert.equal(source.includes("resolveSessionStatusFromDraft"), true);
  assert.equal(source.includes('sessionStatus={resolveSessionStatusFromDraft(draft, "draft")}'), true);
});

test("App changeCurrentSessionStatus performs optimistic update before API call", () => {
  assert.match(source, /statusChangeSnapshotRef\.current\s*=\s*\{\s*interviewStatus:\s*previousInterviewStatus,\s*directStatus:\s*previousDirectStatus\s*\}/);
  assert.match(source, /setDraftPersisted\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{\s*const\s+next\s*=\s*\{\s*\.\.\.prev\s*\}/s);
  assert.match(source, /next\.interview\s*=\s*next\.interview\s*&&\s*typeof\s+next\.interview\s*===\s*"object"\s*\?\s*\{\s*\.\.\.next\.interview,\s*status\s*\}\s*:\s*\{\s*status\s*\}/);
  assert.match(source, /next\.status\s*=\s*status;/);
});

test("App changeCurrentSessionStatus rolls back on failure", () => {
  assert.match(source, /if\s*\(\s*!r\.ok\s*\)\s*\{[\s\S]*?setDraftPersisted\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{\s*const\s+next\s*=\s*\{\s*\.\.\.prev\s*\}/s);
  assert.match(source, /if\s*\(\s*snap\.interviewStatus\s*!==\s*undefined\s*\)\s*next\.interview\.status\s*=\s*snap\.interviewStatus;/);
  assert.match(source, /else\s+delete\s+next\.interview\.status;/);
});

test("App changeCurrentSessionStatus shows Russian 409 message", () => {
  assert.match(source, /if\s*\(\s*r\.status\s*===\s*409\s*\)\s*\{\s*markFail\s*\(\s*"Переход в выбранный статус недоступен для текущего состояния сессии\."\s*\)/);
});
