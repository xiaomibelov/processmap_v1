import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("header uses already normalized publishGitMirrorSnapshot without extractor", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(
    source.includes("extractPublishGitMirrorSnapshot("),
    false,
    "header must not re-normalize already normalized snapshot",
  );
});

test("header preserves normalized versionNumber and lastError fields for render", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.ok(
    source.includes("mirrorSnapshot.versionNumber"),
    "header must use normalized versionNumber for version badge label",
  );
  assert.ok(
    source.includes("title={mirrorLastError ||"),
    "header must preserve lastError for status tooltip",
  );
});

