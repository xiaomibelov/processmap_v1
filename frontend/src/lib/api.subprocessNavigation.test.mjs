import test from "node:test";
import assert from "node:assert/strict";

import { apiNavigateToSubprocess, apiReturnToParent } from "./api.js";

function withFetch(handler, fn) {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = prevFetch;
    });
}

test("subprocess navigation API helpers use correct endpoints and payload contract", async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    calls.push({
      url: String(input || ""),
      method: String(init?.method || "GET"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({
      subprocess_session_id: "sub_1",
      target_element_id: "Task_1",
      breadcrumbs: [
        { session_id: "root_1", name: "Root", element_id: null },
        { session_id: "sub_1", name: "Подпроцесс", element_id: "CallActivity_1" },
      ],
      bpmn_xml: "<xml/>",
      parent_session_id: "root_1",
      element_id_in_parent: "CallActivity_1",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    const navigate = await apiNavigateToSubprocess("root_1", "CallActivity_1", "Task_1");
    const returnTo = await apiReturnToParent("sub_1");

    assert.equal(navigate.ok, true);
    assert.equal(navigate.subprocessSessionId, "sub_1");
    assert.equal(navigate.targetElementId, "Task_1");
    assert.equal(navigate.bpmnXml, "<xml/>");
    assert.equal(navigate.breadcrumbs.length, 2);
    assert.equal(navigate.breadcrumbs[1].element_id, "CallActivity_1");

    assert.equal(returnTo.ok, true);
    assert.equal(returnTo.parentSessionId, "root_1");
    assert.equal(returnTo.elementIdInParent, "CallActivity_1");
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/api\/sessions\/root_1\/subprocess\/CallActivity_1\/navigate\?target_element_id=Task_1$/);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, null);
  assert.match(calls[1].url, /\/api\/sessions\/sub_1\/return$/);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].body, null);
});

test("subprocess navigate omits empty target_element_id query", async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    calls.push({ url: String(input || ""), method: String(init?.method || "GET") });
    return new Response(JSON.stringify({
      subprocess_session_id: "sub_2",
      target_element_id: "",
      breadcrumbs: [],
      bpmn_xml: "",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }, async () => {
    const res = await apiNavigateToSubprocess("root_2", "CallActivity_2");
    assert.equal(res.ok, true);
  });

  assert.match(calls[0].url, /\/api\/sessions\/root_2\/subprocess\/CallActivity_2\/navigate$/);
});
