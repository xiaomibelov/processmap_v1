import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "InterviewPathsView.jsx"), "utf8");

test("InterviewPathsView imports the duration formatter it uses", () => {
  assert.match(
    source,
    /import \{[^}]*formatHHMMFromSeconds[^}]*\} from "\.\/utils";/,
    "formatHHMMFromSeconds must be imported from interview utils",
  );
  assert.match(source, /return formatHHMMFromSeconds\(seconds\);/);
});
