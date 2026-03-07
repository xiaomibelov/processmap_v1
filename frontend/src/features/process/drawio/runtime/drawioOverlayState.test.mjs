import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  applyDrawioLayerRenderState,
  collectDrawioElementIdsFromTarget,
  resolveDrawioPointerElementId,
} from "./drawioOverlayState.js";

test("collectDrawioElementIdsFromTarget reads managed data attribute only", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const prevElement = globalThis.Element;
  try {
    globalThis.Element = dom.window.Element;
    const { document } = dom.window;
    const root = document.createElement("div");
    const managed = document.createElement("g");
    managed.setAttribute("data-drawio-el-id", "shape1");
    managed.setAttribute("id", "shape1");
    const unmanaged = document.createElement("rect");
    unmanaged.setAttribute("id", "Activity_123");
    managed.appendChild(unmanaged);
    root.appendChild(managed);
    document.body.appendChild(root);

    const ids = collectDrawioElementIdsFromTarget(unmanaged, root);
    assert.deepEqual(ids, ["shape1"]);
  } finally {
    globalThis.Element = prevElement;
    dom.window.close();
  }
});

test("applyDrawioLayerRenderState keeps unmanaged nodes visible but non-interactive", () => {
  const body = [
    "<g id=\"shape1\"><rect id=\"shape1_inner\"/></g>",
    "<rect id=\"Activity_123\" x=\"0\" y=\"0\" width=\"10\" height=\"10\"/>",
  ].join("");
  const meta = {
    enabled: true,
    drawio_layers_v1: [{ id: "DL1", visible: true, locked: false, opacity: 1 }],
    drawio_elements_v1: [{ id: "shape1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1 }],
  };
  const rendered = applyDrawioLayerRenderState(body, meta, "shape1", null);
  assert.match(rendered, /data-drawio-el-id="shape1"/);
  assert.match(rendered, /id="Activity_123"/);
  assert.match(rendered, /pointer-events:none;/);
  assert.doesNotMatch(rendered, /Activity_123[^>]*display:none/);
});

test("resolveDrawioPointerElementId ignores unmanaged id chain fallback", () => {
  const meta = {
    enabled: true,
    interaction_mode: "edit",
    drawio_layers_v1: [{ id: "DL1", visible: true, locked: false, opacity: 1 }],
    drawio_elements_v1: [{ id: "shape1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1 }],
  };
  const managedLayerMap = new Map([["DL1", { visible: true, locked: false, opacity: 1 }]]);
  const managedElementMap = new Map([["shape1", { layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1 }]]);
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const prevElement = globalThis.Element;
  try {
    globalThis.Element = dom.window.Element;
    const { document } = dom.window;
    const root = document.createElement("div");
    const unmanaged = document.createElement("rect");
    unmanaged.setAttribute("data-drawio-el-id", "Activity_ghost");
    root.appendChild(unmanaged);
    document.body.appendChild(root);
    const hitId = resolveDrawioPointerElementId(unmanaged, root, meta, managedLayerMap, managedElementMap);
    assert.equal(hitId, "");
  } finally {
    globalThis.Element = prevElement;
    dom.window.close();
  }
});
