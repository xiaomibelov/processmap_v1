import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "NotesPanel.jsx"), "utf8");

test("NotesPanel stabilizes selected camunda entry by semantic cache", () => {
  assert.match(source, /getStableCamundaEntryBySemanticCache/);
  assert.match(source, /const stableSelectedCamundaExtensionEntry = useMemo\(/);
  assert.match(source, /setCamundaPropertiesDraft\(stableSelectedCamundaExtensionEntry\);/);
  assert.match(source, /\[selectedCamundaPropertiesEditable, stableSelectedCamundaExtensionEntry\]/);
});
