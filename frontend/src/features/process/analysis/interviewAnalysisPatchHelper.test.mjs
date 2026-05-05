import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildInterviewAnalysisPatchPayload,
  mergeInterviewAnalysisPatch,
  patchInterviewAnalysis,
  sanitizeInterviewAnalysisPatch,
} from "./interviewAnalysisPatchHelper.js";
import { resetSessionPatchCasCoordinator } from "../stage/utils/sessionPatchCasCoordinator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRODUCT_ACTION = {
  id: "pa_test",
  bpmn_element_id: "Activity_Test",
  action_type: "нарезка",
  action_stage: "подготовка",
  action_object: "куриная грудка",
  action_method: "нож",
  source: "manual",
  confidence: 1,
  manual_corrected: true,
};

test("buildInterviewAnalysisPatchPayload sends only interview.analysis and optional CAS base", () => {
  const payload = buildInterviewAnalysisPatchPayload(
    { product_actions: [PRODUCT_ACTION], custom_marker: "preserve-me" },
    { baseDiagramStateVersion: 123 },
  );

  assert.deepEqual(Object.keys(payload).sort(), ["base_diagram_state_version", "interview"]);
  assert.equal(payload.base_diagram_state_version, 123);
  assert.deepEqual(payload.interview.analysis.product_actions, [PRODUCT_ACTION]);
  assert.equal(payload.interview.analysis.custom_marker, "preserve-me");
});

test("helper bypasses generic Interview autosave guard and uses CAS coordinator", () => {
  const source = fs.readFileSync(path.join(__dirname, "interviewAnalysisPatchHelper.js"), "utf8");

  assert.equal(source.includes("enqueueSessionPatchCasWrite"), true);
  assert.equal(source.includes("useInterviewSyncLifecycle"), false);
  assert.equal(source.includes("shouldBlockInterviewSemanticPrimaryWrite"), false);
});

test("sanitizeInterviewAnalysisPatch removes unsafe prototype keys", () => {
  const nested = { value: "kept" };
  Object.defineProperty(nested, "__proto__", {
    value: { polluted: true },
    enumerable: true,
  });
  const patch = sanitizeInterviewAnalysisPatch({
    ok: true,
    constructor: { polluted: true },
    nested,
  });

  assert.equal(patch.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "constructor"), false);
  assert.deepEqual(patch.nested, { value: "kept" });
  assert.equal({}.polluted, undefined);
});

test("mergeInterviewAnalysisPatch preserves omitted product_actions and replaces explicit product_actions", () => {
  const existing = {
    product_actions: [PRODUCT_ACTION],
    custom_marker: "preserve-me",
  };

  const omitted = mergeInterviewAnalysisPatch(existing, { custom_marker: "updated", new_marker: "incoming" });
  assert.deepEqual(omitted.product_actions, [PRODUCT_ACTION]);
  assert.equal(omitted.custom_marker, "updated");
  assert.equal(omitted.new_marker, "incoming");

  const replacement = [{ ...PRODUCT_ACTION, id: "pa_replacement" }];
  const replaced = mergeInterviewAnalysisPatch(existing, { product_actions: replacement });
  assert.deepEqual(replaced.product_actions, replacement);
  assert.equal(replaced.custom_marker, "preserve-me");
});

test("patchInterviewAnalysis resolves latest CAS base at send time and remembers success version", async () => {
  resetSessionPatchCasCoordinator();
  let contextVersion = 8;
  let remembered = 0;
  const sent = [];
  const response = await patchInterviewAnalysis("sid_1", { custom_marker: "updated" }, {
    baseDiagramStateVersion: 7,
    getBaseDiagramStateVersion: () => contextVersion,
    rememberDiagramStateVersion: (version, options = {}) => {
      remembered = Number(version);
      assert.equal(options.sessionId, "sid_1");
      contextVersion = Math.max(contextVersion, remembered);
    },
    apiPatchSession: async (sid, payload) => {
      sent.push({ sid, payload });
      return {
        ok: true,
        status: 200,
        session: {
          id: sid,
          diagram_state_version: 9,
          interview: {
            analysis: {
              product_actions: [PRODUCT_ACTION],
              custom_marker: "updated",
            },
          },
        },
      };
    },
  });

  assert.equal(response.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].sid, "sid_1");
  assert.deepEqual(sent[0].payload, {
    interview: { analysis: { custom_marker: "updated" } },
    base_diagram_state_version: 8,
  });
  assert.equal(remembered, 9);
  assert.deepEqual(response.analysis.product_actions, [PRODUCT_ACTION]);
});

test("patchInterviewAnalysis surfaces 409 and remembers server current version without retry", async () => {
  resetSessionPatchCasCoordinator();
  let remembered = 0;
  let calls = 0;
  const response = await patchInterviewAnalysis("sid_conflict", { custom_marker: "updated" }, {
    getBaseDiagramStateVersion: () => 10,
    rememberDiagramStateVersion: (version) => {
      remembered = Number(version);
    },
    apiPatchSession: async () => {
      calls += 1;
      return {
        ok: false,
        status: 409,
        error: "DIAGRAM_STATE_CONFLICT",
        data: { server_current_version: 11 },
      };
    },
  });

  assert.equal(response.ok, false);
  assert.equal(response.status, 409);
  assert.equal(response.error, "DIAGRAM_STATE_CONFLICT");
  assert.equal(remembered, 11);
  assert.equal(calls, 1);
});

test("patchInterviewAnalysis rejects malformed or empty patches before network", async () => {
  resetSessionPatchCasCoordinator();
  let calls = 0;
  const apiPatchSession = async () => {
    calls += 1;
    return { ok: true, session: {} };
  };

  const malformed = await patchInterviewAnalysis("sid_1", "bad", { apiPatchSession });
  const empty = await patchInterviewAnalysis("sid_1", {}, { apiPatchSession });

  assert.equal(malformed.ok, false);
  assert.equal(malformed.error, "empty_analysis_patch");
  assert.equal(empty.ok, false);
  assert.equal(empty.error, "empty_analysis_patch");
  assert.equal(calls, 0);
});
