import test from "node:test";
import assert from "node:assert/strict";

import { loadTemplatesForScopes } from "./useTemplatesStore.js";

test("loadTemplatesForScopes loads personal and org lists", async () => {
  const calls = [];
  const out = await loadTemplatesForScopes({
    userId: "u_1",
    orgId: "org_1",
    listFn: async (params) => {
      calls.push(params);
      if (String(params?.scope) === "personal") return [{ id: "p_1" }];
      if (String(params?.scope) === "org") return [{ id: "o_1" }];
      return [];
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(out.myTemplates.length, 1);
  assert.equal(out.orgTemplates.length, 1);
});

test("loadTemplatesForScopes skips org list when no orgId", async () => {
  const calls = [];
  const out = await loadTemplatesForScopes({
    userId: "u_1",
    orgId: "",
    listFn: async (params) => {
      calls.push(params);
      return [{ id: "p_1" }];
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(out.myTemplates.length, 1);
  assert.equal(out.orgTemplates.length, 0);
});
