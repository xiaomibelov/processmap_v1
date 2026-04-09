import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("ProcessStage derives unified revision UI snapshot and uses it for header and dialogs", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("resolveRevisionHistoryUiSnapshot"), true);
  assert.equal(source.includes("const revisionHistoryUiSnapshot = useMemo"), true);
  assert.equal(source.includes("revisionHistorySnapshot: revisionHistoryUiSnapshot"), true);
  assert.equal(source.includes("sessionRevisionHistorySnapshot: revisionHistoryUiSnapshot"), true);
});

test("manual save forwards explicit publish intent for backend version snapshots", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes('persistReason: "publish_manual_save"'), true);
  assert.equal(source.includes("const backendVersionSnapshot = asObject(saved?.bpmnVersionSnapshot);"), true);
  assert.equal(source.includes("const normalizedBackendVersionSnapshot = normalizeBpmnVersionListItem(backendVersionSnapshot);"), true);
  assert.equal(source.includes("setLatestBpmnVersionHead(normalizedBackendVersionSnapshot);"), true);
  assert.equal(source.includes('setLatestBpmnVersionHeadStatus("ready");'), true);
  assert.equal(source.includes("authoritativeRevision: backendVersionSnapshot"), true);
  assert.equal(source.includes("Опубликовано как версия R${backendRevisionNumber}."), true);
  assert.equal(source.includes("Черновик сохранён."), true);
});

test("versions modal first load is headers-only and XML is loaded lazily", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("const BPMN_VERSION_HEADERS_LIMIT = 50;"), true);
  assert.equal(source.includes("await refreshSnapshotVersions({ includeXml: false, limit: BPMN_VERSION_HEADERS_LIMIT });"), true);
  assert.equal(source.includes("apiGetBpmnVersion"), true);
  assert.equal(source.includes("const ensureBpmnVersionXml = useCallback"), true);
  assert.equal(source.includes("setVersionsLoadState(\"loading\")"), true);
  assert.equal(source.includes("setVersionsLoadState(asArray(list).length > 0 ? \"ready\" : \"empty\")"), true);
});
