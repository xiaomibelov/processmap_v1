import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
}

test("BPMN history head check uses one headers-only version instead of initial limit=50 list", () => {
  const source = readSource();
  assert.equal(source.includes("const refreshLatestBpmnRevisionHead = useCallback(async () => {"), true);
  assert.equal(source.includes("limit: 1,\n      updateList: false,\n      trackHeadStatus: true,"), true);
  assert.equal(source.includes("const fallbackLimit = BPMN_VERSION_HEADERS_LIMIT;"), true);
  assert.equal(source.includes("const fallbackLimit = includeXml ? 200 : BPMN_VERSION_HEADERS_LIMIT;"), false);
});

test("opening BPMN history modal relies on one effect-driven headers list fetch", () => {
  const source = readSource();
  const openModalMatch = source.match(/async function openVersionsModal\(\) \{([\s\S]*?)\n  \}/);
  assert.notEqual(openModalMatch, null);
  const openModalBody = String(openModalMatch?.[1] || "");
  assert.match(openModalBody, /setVersionsOpen\(true\);/);
  assert.equal(/refreshSnapshotVersions\(/.test(openModalBody), false);

  assert.match(
    source,
    /useEffect\(\(\) => \{\n\s+if \(!versionsOpen \|\| !sid\) return;\n\s+void refreshSnapshotVersions\(\);/,
  );
});

test("BPMN history list requests are deduped and stale responses are ignored", () => {
  const source = readSource();
  assert.equal(source.includes("const bpmnVersionsListRequestRef = useRef({ key: \"\", promise: null });"), true);
  assert.equal(source.includes("const requestKey = `${requestSid}|limit=${limit}|includeXml=${includeXml ? \"1\" : \"0\"}|updateList=${updateList ? \"1\" : \"0\"}|trackHead=${trackHeadStatus ? \"1\" : \"0\"}`;"), true);
  assert.equal(source.includes("return bpmnVersionsListRequestRef.current.promise;"), true);
  assert.equal(source.includes("if (bpmnVersionsActiveSessionRef.current !== requestSid) return;"), true);
  assert.equal(source.includes("if (updateList && !bpmnVersionsOpenRef.current) return;"), true);
});

test("BPMN history open ref is updated after versionsOpen is initialized", () => {
  const source = readSource();
  const versionsOpenIndex = source.indexOf("versionsOpen,\n    setVersionsOpen,");
  const openRefUpdateIndex = source.indexOf("bpmnVersionsOpenRef.current = versionsOpen;");
  assert.notEqual(versionsOpenIndex, -1);
  assert.notEqual(openRefUpdateIndex, -1);
  assert.equal(openRefUpdateIndex > versionsOpenIndex, true);
});

test("BPMN version XML is lazy-loaded through selected-version detail only", () => {
  const source = readSource();
  const ensureMatch = source.match(/const ensureBpmnVersionXml = useCallback\(async \(versionOrId\) => \{([\s\S]*?)\n  \}, \[/);
  assert.notEqual(ensureMatch, null);
  const ensureBody = String(ensureMatch?.[1] || "");
  assert.match(ensureBody, /apiGetBpmnVersion\(sid, versionId\)/);
  assert.equal(/apiGetBpmnVersions\(sid, \{[^}]*includeXml:\s*true/.test(ensureBody), false);
  assert.match(ensureBody, /bpmnVersionDetailRequestRef\.current\.get/);
  assert.match(ensureBody, /bpmnVersionsActiveSessionRef\.current !== requestSid \|\| !bpmnVersionsOpenRef\.current/);
});
