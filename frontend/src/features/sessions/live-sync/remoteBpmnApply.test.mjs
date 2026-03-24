import test from "node:test";
import assert from "node:assert/strict";
import { shouldAdoptRemoteBpmnXml } from "./remoteBpmnApply.js";

test("shouldAdoptRemoteBpmnXml applies only for new remote token on clean xml state", () => {
  assert.deepEqual(
    shouldAdoptRemoteBpmnXml({
      sessionId: "s1",
      draftSessionId: "s1",
      remoteVersionToken: "tok-2",
      lastAppliedRemoteVersionToken: "tok-1",
      xmlDirty: false,
      currentXml: "<defs>A</defs>",
      draftXml: "<defs>B</defs>",
    }),
    { apply: true, reason: "apply_remote_bpmn_xml" },
  );
});

test("shouldAdoptRemoteBpmnXml rejects empty token/dirty/equivalent xml", () => {
  assert.equal(
    shouldAdoptRemoteBpmnXml({
      sessionId: "s1",
      draftSessionId: "s1",
      remoteVersionToken: "",
      xmlDirty: false,
      currentXml: "<defs>A</defs>",
      draftXml: "<defs>B</defs>",
    }).apply,
    false,
  );
  assert.equal(
    shouldAdoptRemoteBpmnXml({
      sessionId: "s1",
      draftSessionId: "s1",
      remoteVersionToken: "tok-2",
      lastAppliedRemoteVersionToken: "tok-1",
      xmlDirty: true,
      currentXml: "<defs>A</defs>",
      draftXml: "<defs>B</defs>",
    }).reason,
    "xml_editor_dirty",
  );
  assert.equal(
    shouldAdoptRemoteBpmnXml({
      sessionId: "s1",
      draftSessionId: "s1",
      remoteVersionToken: "tok-2",
      lastAppliedRemoteVersionToken: "tok-1",
      xmlDirty: false,
      currentXml: "<defs>A</defs>",
      draftXml: "<defs>A</defs>",
    }).reason,
    "xml_equivalent",
  );
});

test("shouldAdoptRemoteBpmnXml treats matching local token as self-origin no-op", () => {
  assert.deepEqual(
    shouldAdoptRemoteBpmnXml({
      sessionId: "s1",
      draftSessionId: "s1",
      remoteVersionToken: "tok-2",
      localVersionToken: "tok-2",
      lastAppliedRemoteVersionToken: "tok-1",
      xmlDirty: false,
      currentXml: "<defs>A</defs>",
      draftXml: "<defs>B</defs>",
    }),
    { apply: false, reason: "remote_token_matches_local" },
  );
});

test("shouldAdoptRemoteBpmnXml allows forced apply for matching remote token even when xml is dirty", () => {
  assert.deepEqual(
    shouldAdoptRemoteBpmnXml({
      sessionId: "s1",
      draftSessionId: "s1",
      remoteVersionToken: "tok-2",
      forceApplyRemoteVersionToken: "tok-2",
      lastAppliedRemoteVersionToken: "tok-1",
      xmlDirty: true,
      currentXml: "<defs>A</defs>",
      draftXml: "<defs>B</defs>",
    }),
    { apply: true, reason: "apply_remote_bpmn_xml_forced" },
  );
});
