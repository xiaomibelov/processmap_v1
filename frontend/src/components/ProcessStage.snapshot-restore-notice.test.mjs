import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");

test("snapshot restore notice is consumed after showing once", () => {
  assert.match(source, /onSnapshotRestoreNoticeConsumed/);
  assert.match(source, /onSnapshotRestoreNoticeConsumed\?\.\(sid, Number\(notice\?\.nonce \|\| 0\)\)/);
});
