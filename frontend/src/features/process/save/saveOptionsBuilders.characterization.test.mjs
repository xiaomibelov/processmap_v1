import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSaveAllBatchOptions } from "./saveAllBatch.js";
import { buildPropertySaveOptions } from "./propertySaveBoundary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-pipeline-extraction-v1 (Этап 1, п.2).
// Сборка опций saveBpmnState перенесена дословно из App.jsx в save-модули:
//   - save_all batch (App.jsx handleSaveAllBatch, был :1096-1114) → saveAllBatch.js;
//   - camunda-property save (App.jsx setElementCamundaExtensions, был :2957-2986)
//     → propertySaveBoundary.js.
// Тест фиксирует байтовую эквивалентность собранных опций (ключи, порядок
// ключей, значения, делегирование колбэков через параметры).
// ---------------------------------------------------------------------------

function createStageRef({ baseVersion = 6 } = {}) {
  return {
    current: {
      getBaseDiagramStateVersion: () => baseVersion,
      rememberDiagramStateVersion: (version, meta) => ({ version, meta }),
      getRuntimeXmlSnapshot: async () => ({ ok: true, xml: "<bpmn:definitions id=\"stage\"/>" }),
      flushSave: async () => ({ ok: true }),
    },
  };
}

test("buildSaveAllBatchOptions mirrors App.jsx save_all options verbatim", () => {
  const bpmnStageRef = createStageRef({ baseVersion: 6 });
  const apiPutBpmnXml = async () => ({ ok: true });
  const flushSave = async () => ({ ok: true });
  const apiGetSession = async () => ({ ok: true });
  const apiGetBpmnXml = async () => ({ ok: true });
  const onSessionSync = () => {};
  const overwriteBpmnSnapshot = () => {};

  const opts = buildSaveAllBatchOptions({
    sid: "sid_1",
    xml: "<xml/>",
    projectId: "pid_1",
    bpmnMeta: { version: 2 },
    apiPutBpmnXml,
    flushSave,
    apiGetSession,
    apiGetBpmnXml,
    onSessionSync,
    overwriteBpmnSnapshot,
    bpmnStageRef,
  });

  assert.deepEqual(
    Object.keys(opts),
    [
      "operation",
      "sessionId",
      "isLocal",
      "baseDiagramStateVersion",
      "getBaseDiagramStateVersion",
      "rememberDiagramStateVersion",
      "projectId",
      "xml",
      "nextMeta",
      "apiPutBpmnXml",
      "flushSave",
      "apiGetSession",
      "apiGetBpmnXml",
      "onSessionSync",
      "overwriteBpmnSnapshot",
      "backgroundSessionRefresh",
      "syncSource",
    ],
    "save_all options key order must match the original App.jsx literal",
  );
  assert.equal(opts.operation, "session_save");
  assert.equal(opts.sessionId, "sid_1");
  assert.equal(opts.isLocal, false);
  assert.equal(opts.baseDiagramStateVersion, 6);
  assert.equal(opts.getBaseDiagramStateVersion(), 6, "getBase delegates to bpmnStageRef");
  assert.deepEqual(
    opts.rememberDiagramStateVersion(9),
    { version: 9, meta: { sessionId: "sid_1" } },
    "remember delegates to bpmnStageRef with { sessionId: sid }",
  );
  assert.equal(opts.projectId, "pid_1");
  assert.equal(opts.xml, "<xml/>");
  assert.deepEqual(opts.nextMeta, { version: 2 });
  assert.equal(opts.apiPutBpmnXml, apiPutBpmnXml);
  assert.equal(opts.flushSave, flushSave);
  assert.equal(opts.apiGetSession, apiGetSession);
  assert.equal(opts.apiGetBpmnXml, apiGetBpmnXml);
  assert.equal(opts.onSessionSync, onSessionSync);
  assert.equal(opts.overwriteBpmnSnapshot, overwriteBpmnSnapshot);
  assert.equal(opts.backgroundSessionRefresh, true);
  assert.equal(opts.syncSource, "saveBpmnState:save_all");
});

test("buildPropertySaveOptions mirrors App.jsx camunda-property options verbatim", async () => {
  const bpmnStageRef = createStageRef({ baseVersion: 7 });
  const apiPutBpmnXml = async () => ({ ok: true });
  const flushSave = async () => ({ ok: true });
  const apiGetSession = async () => ({ ok: true });
  const apiGetBpmnXml = async () => ({ ok: true });
  const onSessionSync = () => {};
  const overwriteBpmnSnapshot = () => {};
  const currentMeta = { version: 1 };
  const optimisticMeta = { version: 2 };
  const currentCamundaExtensionsByElementId = { el_1: { a: 1 } };
  const nextCamundaExtensionsByElementId = { el_1: { a: 2 } };
  const onDurableSaveAck = () => {};
  const onBackgroundSessionSyncStart = () => {};
  const onBackgroundSessionSyncComplete = () => {};
  const onBackgroundSessionSyncError = () => {};

  const opts = buildPropertySaveOptions({
    operation: "property_update",
    sid: "sid_2",
    isLocal: false,
    baseDiagramStateVersion: 7,
    projectId: "pid_2",
    elementId: "el_1",
    currentCamundaExtensionsByElementId,
    nextCamundaExtensionsByElementId,
    currentMeta,
    optimisticMeta,
    apiPutBpmnXml,
    flushSave,
    apiGetSession,
    apiGetBpmnXml,
    onSessionSync,
    overwriteBpmnSnapshot,
    options: {
      backgroundSessionRefresh: true,
      onDurableSaveAck,
      onBackgroundSessionSyncStart,
      onBackgroundSessionSyncComplete,
      onBackgroundSessionSyncError,
    },
    bpmnStageRef,
  });

  assert.deepEqual(
    Object.keys(opts),
    [
      "operation",
      "sessionId",
      "isLocal",
      "baseDiagramStateVersion",
      "getBaseDiagramStateVersion",
      "rememberDiagramStateVersion",
      "projectId",
      "elementId",
      "currentCamundaExtensionsByElementId",
      "nextCamundaExtensionsByElementId",
      "currentMeta",
      "nextMeta",
      "getModelerXml",
      "apiPutBpmnXml",
      "flushSave",
      "apiGetSession",
      "apiGetBpmnXml",
      "onSessionSync",
      "overwriteBpmnSnapshot",
      "backgroundSessionRefresh",
      "onDurableSaveAck",
      "onBackgroundSessionSyncStart",
      "onBackgroundSessionSyncComplete",
      "onBackgroundSessionSyncError",
      "syncSource",
    ],
    "camunda-property options key order must match the original App.jsx literal",
  );
  assert.equal(opts.operation, "property_update");
  assert.equal(opts.sessionId, "sid_2");
  assert.equal(opts.isLocal, false);
  assert.equal(opts.baseDiagramStateVersion, 7);
  assert.equal(opts.getBaseDiagramStateVersion(), 7);
  assert.deepEqual(opts.rememberDiagramStateVersion(11), { version: 11, meta: { sessionId: "sid_2" } });
  assert.equal(opts.projectId, "pid_2");
  assert.equal(opts.elementId, "el_1");
  assert.equal(opts.currentCamundaExtensionsByElementId, currentCamundaExtensionsByElementId);
  assert.equal(opts.nextCamundaExtensionsByElementId, nextCamundaExtensionsByElementId);
  assert.equal(opts.currentMeta, currentMeta);
  assert.equal(opts.nextMeta, optimisticMeta);
  assert.equal(await opts.getModelerXml(), "<bpmn:definitions id=\"stage\"/>", "getModelerXml delegates to bpmnStageRef snapshot");
  assert.equal(opts.apiPutBpmnXml, apiPutBpmnXml);
  assert.equal(opts.flushSave, flushSave);
  assert.equal(opts.apiGetSession, apiGetSession);
  assert.equal(opts.apiGetBpmnXml, apiGetBpmnXml);
  assert.equal(opts.onSessionSync, onSessionSync);
  assert.equal(opts.overwriteBpmnSnapshot, overwriteBpmnSnapshot);
  assert.equal(opts.backgroundSessionRefresh, true);
  assert.equal(opts.onDurableSaveAck, onDurableSaveAck);
  assert.equal(opts.onBackgroundSessionSyncStart, onBackgroundSessionSyncStart);
  assert.equal(opts.onBackgroundSessionSyncComplete, onBackgroundSessionSyncComplete);
  assert.equal(opts.onBackgroundSessionSyncError, onBackgroundSessionSyncError);
  assert.equal(opts.syncSource, "saveBpmnState:camunda_extensions");
});

test("App.jsx consumes option builders from save-modules instead of inline literals", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "../../../App.jsx"), "utf8");

  assert.match(
    appSource,
    /from\s+["'][^"']*save\/saveAllBatch["']/,
    "App.jsx must import buildSaveAllBatchOptions from features/process/save/saveAllBatch",
  );
  assert.match(
    appSource,
    /from\s+["'][^"']*save\/propertySaveBoundary["']/,
    "App.jsx must import buildPropertySaveOptions from features/process/save/propertySaveBoundary",
  );
  assert.doesNotMatch(
    appSource,
    /syncSource:\s*"saveBpmnState:/,
    "inline syncSource literals must live in the save-modules, not in App.jsx",
  );
});
