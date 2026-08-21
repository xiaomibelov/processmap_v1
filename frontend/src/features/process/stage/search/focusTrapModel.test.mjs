import assert from "node:assert/strict";
import test from "node:test";

import {
  collectFocusableElements,
  isHiddenFromFocus,
  resolveTrapTarget,
  trapTabKeyEvent,
} from "./focusTrapModel.js";

function makeEl(attrs = {}) {
  return {
    focus() {
      this.focused = true;
    },
    getAttribute: (name) => attrs[name] ?? null,
    style: attrs.style || {},
    hidden: attrs.hidden === true,
    id: attrs.id || "",
  };
}

function makeRoot(children) {
  return {
    ownerDocument: { activeElement: null },
    querySelectorAll: () => children,
  };
}

test("resolveTrapTarget: cycles forward and backward with wraparound", () => {
  const a = makeEl({ id: "a" });
  const b = makeEl({ id: "b" });
  const c = makeEl({ id: "c" });
  const list = [a, b, c];
  assert.equal(resolveTrapTarget({ activeElement: a, focusables: list }), b);
  assert.equal(resolveTrapTarget({ activeElement: c, focusables: list }), a);
  assert.equal(resolveTrapTarget({ activeElement: a, focusables: list, shiftKey: true }), c);
  assert.equal(resolveTrapTarget({ activeElement: b, focusables: list, shiftKey: true }), a);
});

test("resolveTrapTarget: focus outside list jumps to first/last edge", () => {
  const a = makeEl();
  const b = makeEl();
  const outsider = makeEl();
  assert.equal(resolveTrapTarget({ activeElement: outsider, focusables: [a, b] }), a);
  assert.equal(resolveTrapTarget({ activeElement: outsider, focusables: [a, b], shiftKey: true }), b);
  assert.equal(resolveTrapTarget({ activeElement: null, focusables: [a, b] }), a);
});

test("resolveTrapTarget: empty list returns null and tolerates garbage", () => {
  assert.equal(resolveTrapTarget({ activeElement: null, focusables: [] }), null);
  assert.equal(resolveTrapTarget({ activeElement: null, focusables: null }), null);
  assert.equal(resolveTrapTarget({}), null);
});

test("isHiddenFromFocus: hidden, aria-hidden and display:none are excluded", () => {
  assert.equal(isHiddenFromFocus(makeEl({ hidden: true })), true);
  assert.equal(isHiddenFromFocus(makeEl({ "aria-hidden": "true" })), true);
  assert.equal(isHiddenFromFocus(makeEl({ style: { display: "none" } })), true);
  assert.equal(isHiddenFromFocus(makeEl({ style: { visibility: "hidden" } })), true);
  assert.equal(isHiddenFromFocus(makeEl()), false);
  assert.equal(isHiddenFromFocus(null), true);
});

test("collectFocusableElements: filters hidden nodes and tolerates broken roots", () => {
  const visible = makeEl();
  const hidden = makeEl({ style: { display: "none" } });
  assert.deepEqual(collectFocusableElements(makeRoot([visible, hidden])), [visible]);
  assert.deepEqual(collectFocusableElements(null), []);
  assert.deepEqual(collectFocusableElements({}), []);
  assert.deepEqual(
    collectFocusableElements({
      querySelectorAll: () => {
        throw new Error("boom");
      },
    }),
    [],
  );
});

test("trapTabKeyEvent: traps Tab, focuses resolved target, ignores other keys", () => {
  const a = makeEl();
  const b = makeEl();
  const root = makeRoot([a, b]);
  root.ownerDocument.activeElement = a;
  let prevented = 0;
  const event = {
    key: "Tab",
    shiftKey: false,
    preventDefault: () => {
      prevented += 1;
    },
  };
  assert.equal(trapTabKeyEvent(event, root), true);
  assert.equal(prevented, 1);
  assert.equal(b.focused, true);
  assert.equal(trapTabKeyEvent({ key: "Enter" }, root), false);
});
