import test from "node:test";
import assert from "node:assert/strict";

import { getFirstPickedFile } from "./fileInputEvent.js";

test("getFirstPickedFile returns first File from FileList-like object", () => {
  class FakeFile {}
  globalThis.File = FakeFile;
  const first = new FakeFile();
  const second = new FakeFile();
  const files = {
    0: first,
    1: second,
    length: 2,
    item(index) {
      return this[index] || null;
    },
    *[Symbol.iterator]() {
      yield first;
      yield second;
    },
  };
  assert.equal(getFirstPickedFile({ target: { files } }), first);
});

test("getFirstPickedFile returns null when no valid file exists", () => {
  class FakeFile {}
  globalThis.File = FakeFile;
  assert.equal(getFirstPickedFile({ target: { files: null } }), null);
  assert.equal(getFirstPickedFile({ target: { files: [] } }), null);
  assert.equal(getFirstPickedFile({ target: { files: { 0: {} } } }), null);
});
