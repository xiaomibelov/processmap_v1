import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (TESTS §1.2, наследие п.3):
// dead keepalive-код удалён — grep-контракт: isWithinKeepaliveBudget,
// keepaliveBodyLimitBytes, pageHideDrainTimeoutMs отсутствуют в исходниках
// opsOutbox (keepalive-flush сам жив и не тронут).
// ---------------------------------------------------------------------------

const dir = path.dirname(fileURLToPath(import.meta.url));
const DEAD_IDENTIFIERS = [
  "isWithinKeepaliveBudget",
  "keepaliveBodyLimitBytes",
  "pageHideDrainTimeoutMs",
];

test("dead keepalive identifiers are absent from opsOutbox sources", () => {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(dir, name));
  assert.ok(files.length >= 4, "scans the opsOutbox module sources");
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const identifier of DEAD_IDENTIFIERS) {
      assert.ok(
        !src.includes(identifier),
        `${identifier} must be removed from ${path.basename(file)} (наследие п.3 §3 PLAN)`,
      );
    }
  }
});

test("keepalive flush path itself is intact (keepaliveAbortMs preserved)", async () => {
  const { OPS_OUTBOX_CONFIG } = await import("./opsOutboxConfig.js");
  assert.equal(OPS_OUTBOX_CONFIG.keepaliveAbortMs, 5000, "keepalive abort timeout stays");
  const src = fs.readFileSync(path.join(dir, "createSaveOutbox.js"), "utf8");
  assert.ok(src.includes("keepalive"), "keepalive flush path not removed");
});
