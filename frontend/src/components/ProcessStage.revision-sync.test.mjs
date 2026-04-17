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
  assert.equal(source.includes("handleCreateRevisionAction,"), true);
});

test("session save and explicit revision action stay separated by contract", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("async function runManualSaveAction({ createRevision = false } = {})"), true);
  assert.equal(source.includes("async function handleCreateRevisionAction()"), true);
  assert.equal(source.includes("await runManualSaveAction({ createRevision: true });"), true);
  assert.equal(source.includes('const persistReason = createRevision ? "publish_manual_save" : "manual_save";'), true);
  assert.equal(source.includes("publishRevision: createRevision"), true);
  assert.equal(source.includes('revisionSource: createRevision ? "publish_manual_save" : "manual_save"'), true);
  assert.equal(source.includes("const backendVersionSnapshot = asObject(saved?.bpmnVersionSnapshot);"), true);
  assert.equal(source.includes("const normalizedBackendVersionSnapshot = normalizeBpmnVersionListItem(backendVersionSnapshot);"), true);
  assert.equal(source.includes("setLatestBpmnVersionHead(normalizedBackendVersionSnapshot);"), true);
  assert.equal(source.includes('setLatestBpmnVersionHeadStatus("ready");'), true);
  assert.equal(source.includes("authoritativeRevision: backendVersionSnapshot"), true);
  assert.equal(source.includes("const shouldSyncCompanion = backendRevisionNumber > 0;"), true);
  assert.equal(source.includes("Сессия сохранена."), true);
  assert.equal(source.includes("Сессия уже сохранена: изменений схемы нет."), true);
  assert.equal(source.includes("Создана новая ревизия."), true);
  assert.equal(source.includes("Новая ревизия не создана: сохранённых изменений нет."), true);
  assert.equal(source.includes("saveInfo,"), true);
  assert.equal(source.includes('persistReason: "manual_save"'), false);
  assert.equal(source.includes("Новая версия не создана"), false);
  assert.equal(source.includes("resolveManualSaveOutcomeUi"), true);
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

test("versions history keeps meaningful revisions and filters technical traces", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("splitMeaningfulAndTechnicalRevisions"), true);
  assert.equal(source.includes("const list = asArray(revisionSplit.meaningful);"), true);
  assert.equal(source.includes("meaningful_count="), true);
  assert.equal(source.includes("technical_count="), true);
});
