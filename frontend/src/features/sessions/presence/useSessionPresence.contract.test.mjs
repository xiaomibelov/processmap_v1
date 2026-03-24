import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("useSessionPresence resets state and guards against stale async updates across session switches", () => {
  const source = fs.readFileSync(path.join(__dirname, "useSessionPresence.js"), "utf8");
  assert.equal(source.includes("requestSeqRef.current += 1"), true);
  assert.equal(source.includes("if (isDisposed || requestSeqRef.current !== scopeSeq) return;"), true);
  assert.equal(source.includes("setState({ status: \"idle\", otherActiveUsersCount: 0 });"), true);
  assert.equal(source.includes("}, [intervalMs, isEnabled, sid]);"), true);
});

