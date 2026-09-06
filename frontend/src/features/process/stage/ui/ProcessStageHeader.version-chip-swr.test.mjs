import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
}

test("version chip title falls back to the published-revision badge title only when no version resolves and no refetch is in flight", () => {
  const source = readSource();
  assert.match(
    source,
    /: \(latestPublishedRevisionStatus === "loading"\n\s+\? "Обновление версии…"\n\s+: \(publishedRevisionBadge\.title \|\| "Версия пока не создана\."\)\);/,
    "badge-title fallback must be bypassed while the head refetch is loading",
  );
});

test("version chip title is honest while the head refetch is in flight", () => {
  const source = readSource();
  // While the head is loading and nothing is resolved, the title must not claim
  // that there are no published versions — that fact is only known after refetch.
  assert.match(
    source,
    /: \(latestPublishedRevisionStatus === "loading"\n\s+\? "Обновление версии…"\n\s+: \(publishedRevisionBadge\.title \|\| "Версия пока не создана\."\)\);/,
  );
  assert.match(
    source,
    /const latestPublishedRevisionStatus = toText\(sessionRevisionHistorySnapshot\?\.latestPublishedRevisionStatus\);/,
  );
});
