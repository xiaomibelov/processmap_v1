import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCtrlSaveKeydownHandler, isCtrlSaveShortcutEvent } from "./ctrlSaveShortcut.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readProcessStageSource() {
  return fs.readFileSync(
    path.join(__dirname, "../../../../components/ProcessStage.jsx"),
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Контур canvas-save-hot-path-v1 (коммит 4): глобальный Ctrl/Cmd+S.
// keydown ctrl/meta+S → preventDefault → тот же путь, что кнопка сохранения.
// Не перехватываем в input/textarea/select/contenteditable (guard по образцу
// BpmnStage.jsx copy/paste). Работает независимо от фокуса на canvas.
// ---------------------------------------------------------------------------

function keyEvent({ key = "s", ctrlKey = false, metaKey = false, altKey = false, target = null, repeat = false } = {}) {
  return {
    key,
    ctrlKey,
    metaKey,
    altKey,
    repeat,
    target,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function editableTarget(kind = "input") {
  if (kind === "textarea") return { tagName: "TEXTAREA" };
  if (kind === "select") return { tagName: "SELECT" };
  if (kind === "contenteditable") return { tagName: "DIV", getAttribute: () => "true" };
  return { tagName: "INPUT" };
}

test("isCtrlSaveShortcutEvent matches ctrl+S and meta+S only", () => {
  assert.equal(isCtrlSaveShortcutEvent(keyEvent({ ctrlKey: true })), true);
  assert.equal(isCtrlSaveShortcutEvent(keyEvent({ metaKey: true })), true);
  assert.equal(isCtrlSaveShortcutEvent(keyEvent({ key: "S", ctrlKey: true })), true, "uppercase S with shift still saves");
  assert.equal(isCtrlSaveShortcutEvent(keyEvent({ ctrlKey: true, altKey: true })), false, "alt combos are not save");
  assert.equal(isCtrlSaveShortcutEvent(keyEvent({})), false, "plain s is not save");
  assert.equal(isCtrlSaveShortcutEvent(keyEvent({ key: "p", ctrlKey: true })), false);
  assert.equal(isCtrlSaveShortcutEvent(null), false);
});

test("handler calls preventDefault and the save path on ctrl/meta+S", () => {
  const calls = [];
  const handler = createCtrlSaveKeydownHandler({ onSave: () => calls.push("save") });

  const event = keyEvent({ ctrlKey: true });
  const handled = handler(event);

  assert.equal(handled, true, "shortcut must be handled");
  assert.equal(event.defaultPrevented, true, "browser Save-Page dialog must be suppressed");
  assert.deepEqual(calls, ["save"]);
});

test("handler ignores editable targets (input/textarea/select/contenteditable)", () => {
  const calls = [];
  const handler = createCtrlSaveKeydownHandler({ onSave: () => calls.push("save") });

  for (const kind of ["input", "textarea", "select", "contenteditable"]) {
    const event = keyEvent({ ctrlKey: true, target: editableTarget(kind) });
    const handled = handler(event);
    assert.equal(handled, false, `must not intercept in ${kind}`);
    assert.equal(event.defaultPrevented, false, `must not preventDefault in ${kind}`);
  }
  assert.deepEqual(calls, [], "save path must not run for editable targets");
});

test("handler ignores non-save keys and passes them through", () => {
  const calls = [];
  const handler = createCtrlSaveKeydownHandler({ onSave: () => calls.push("save") });

  const event = keyEvent({ key: "p", ctrlKey: true });
  assert.equal(handler(event), false);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(calls, []);
});

test("handler works without a target (window-level listener, focus outside canvas)", () => {
  const calls = [];
  const handler = createCtrlSaveKeydownHandler({ onSave: () => calls.push("save") });
  const event = keyEvent({ metaKey: true, target: { tagName: "DIV" } });
  assert.equal(handler(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(calls, ["save"]);
});

// --- Source contract: ProcessStage wires the global shortcut ----------------

test("source contract: ProcessStage attaches window keydown Ctrl+S to the manual save path", () => {
  const source = readProcessStageSource();
  assert.ok(
    source.includes('from "../features/process/bpmn/save/ctrlSaveShortcut.js"'),
    "ProcessStage must import the Ctrl+S shortcut helper",
  );
  assert.ok(
    source.includes("createCtrlSaveKeydownHandler({"),
    "ProcessStage must attach the keydown handler",
  );
  const attachIdx = source.indexOf('window.addEventListener("keydown", onCtrlSaveKeyDown);');
  assert.ok(attachIdx !== -1, "ProcessStage must listen to window keydown");
  const detachIdx = source.indexOf('window.removeEventListener("keydown", onCtrlSaveKeyDown);');
  assert.ok(detachIdx !== -1, "ProcessStage must clean up the listener");
  const effectStart = source.lastIndexOf("useEffect(() =>", attachIdx);
  const effectBody = source.slice(effectStart, detachIdx + 60);
  const handlerIdx = effectBody.indexOf("createCtrlSaveKeydownHandler({");
  const refIdx = effectBody.indexOf("runManualSaveActionRef.current");
  assert.ok(handlerIdx !== -1, "effect must build the shortcut handler");
  assert.ok(refIdx !== -1, "shortcut must route through the manual save action ref");
});
