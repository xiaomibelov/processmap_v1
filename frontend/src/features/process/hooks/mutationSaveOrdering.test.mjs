import assert from "node:assert/strict";
import test from "node:test";

import { shouldIssueInterviewPatchAfterSave } from "./mutationSaveOrdering.js";

test("blocks interview patch while save confirmation is pending", () => {
  assert.equal(
    shouldIssueInterviewPatchAfterSave({
      savePending: true,
      patchKeysCount: 2,
    }),
    false,
  );
});

test("blocks interview patch for local-only or stale states", () => {
  assert.equal(
    shouldIssueInterviewPatchAfterSave({
      savePending: false,
      isLocal: true,
      isStale: false,
      patchKeysCount: 1,
    }),
    false,
  );
  assert.equal(
    shouldIssueInterviewPatchAfterSave({
      savePending: false,
      isLocal: false,
      isStale: true,
      patchKeysCount: 1,
    }),
    false,
  );
});

test("allows interview patch only after confirmed save with non-empty patch payload", () => {
  assert.equal(
    shouldIssueInterviewPatchAfterSave({
      savePending: false,
      isLocal: false,
      isStale: false,
      patchKeysCount: 0,
    }),
    false,
  );
  assert.equal(
    shouldIssueInterviewPatchAfterSave({
      savePending: false,
      isLocal: false,
      isStale: false,
      patchKeysCount: 3,
    }),
    true,
  );
});
