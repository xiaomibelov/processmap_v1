import assert from "node:assert/strict";
import test from "node:test";

import {
  isEditableEventTarget,
  isSearchHotkeyEvent,
} from "./diagramSearchHotkey.js";

test("isSearchHotkeyEvent: Ctrl+K and Cmd+K match, plain K does not", () => {
  assert.equal(isSearchHotkeyEvent({ key: "k", ctrlKey: true }), true);
  assert.equal(isSearchHotkeyEvent({ key: "K", ctrlKey: true }), true);
  assert.equal(isSearchHotkeyEvent({ key: "k", metaKey: true }), true);
  assert.equal(isSearchHotkeyEvent({ key: "k" }), false);
  assert.equal(isSearchHotkeyEvent({ key: "f", ctrlKey: true }), false);
});

test("isSearchHotkeyEvent: rejects shift/alt modifiers and garbage", () => {
  assert.equal(isSearchHotkeyEvent({ key: "k", ctrlKey: true, shiftKey: true }), false);
  assert.equal(isSearchHotkeyEvent({ key: "k", ctrlKey: true, altKey: true }), false);
  assert.equal(isSearchHotkeyEvent(null), false);
  assert.equal(isSearchHotkeyEvent(undefined), false);
  assert.equal(isSearchHotkeyEvent({}), false);
});

test("isEditableEventTarget: input/textarea/select/contentEditable are protected", () => {
  assert.equal(isEditableEventTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableEventTarget({ tagName: "textarea" }), true);
  assert.equal(isEditableEventTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableEventTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditableEventTarget({ tagName: "DIV" }), false);
  assert.equal(isEditableEventTarget(null), false);
});

test("isEditableEventTarget: closest() match inside contenteditable subtree", () => {
  const inside = {
    tagName: "SPAN",
    closest: (selector) => (selector.includes("contenteditable") ? {} : null),
  };
  assert.equal(isEditableEventTarget(inside), true);
  const outside = { tagName: "SPAN", closest: () => null };
  assert.equal(isEditableEventTarget(outside), false);
  const throwing = {
    tagName: "SPAN",
    closest: () => {
      throw new Error("bad selector");
    },
  };
  assert.equal(isEditableEventTarget(throwing), false);
});
