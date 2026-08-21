import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

test("App imports and uses useSessionStatusOptimisticUpdate", () => {
  assert.equal(source.includes('import useSessionStatusOptimisticUpdate from "'), true);
  assert.equal(source.includes("const { changeCurrentSessionStatus } = useSessionStatusOptimisticUpdate"), true);
});

test("App wires topbar status from draft.interview status resolver", () => {
  assert.equal(source.includes("resolveSessionStatusFromDraft"), true);
  assert.equal(source.includes('sessionStatus={resolveSessionStatusFromDraft(draft, "draft")}'), true);
});

test("App passes onChangeSessionStatus to TopBar when user can change status", () => {
  assert.equal(source.includes("onChangeSessionStatus={workspacePermissions.canChangeStatus ? changeCurrentSessionStatus : undefined}"), true);
});
