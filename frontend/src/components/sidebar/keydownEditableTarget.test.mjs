import assert from "node:assert/strict";
import test from "node:test";

import { isEditableKeydownTarget } from "./keydownEditableTarget.js";

test("returns true for native editable elements", () => {
  assert.equal(isEditableKeydownTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableKeydownTarget({ tagName: "input" }), true);
  assert.equal(isEditableKeydownTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableKeydownTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableKeydownTarget({ tagName: "BUTTON" }), true);
});

test("returns true for contentEditable targets", () => {
  assert.equal(isEditableKeydownTarget({ tagName: "DIV", isContentEditable: true }), true);
});

test("returns true for children of editable containers", () => {
  const target = {
    tagName: "SPAN",
    closest: (selector) => (selector.includes("input") ? { tagName: "INPUT" } : null),
  };
  assert.equal(isEditableKeydownTarget(target), true);
});

test("returns false for plain and empty targets", () => {
  assert.equal(isEditableKeydownTarget({ tagName: "DIV" }), false);
  assert.equal(isEditableKeydownTarget({ tagName: "CANVAS" }), false);
  assert.equal(isEditableKeydownTarget(null), false);
  assert.equal(isEditableKeydownTarget(undefined), false);
  assert.equal(
    isEditableKeydownTarget({ tagName: "SPAN", closest: () => null }),
    false
  );
});
