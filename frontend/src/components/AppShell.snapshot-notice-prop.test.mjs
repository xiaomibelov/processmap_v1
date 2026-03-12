import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");

test("AppShell forwards snapshot notice consume callback into ProcessStage", () => {
  assert.match(source, /onSnapshotRestoreNoticeConsumed/);
  assert.match(source, /<ProcessStage[\s\S]*onSnapshotRestoreNoticeConsumed=\{onSnapshotRestoreNoticeConsumed\}/);
});

