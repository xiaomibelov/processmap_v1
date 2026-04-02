import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { applyDrawioLayerRenderStateToDom } from "./drawioOverlayState.js";

const DRAWIO_REGISTRY_RECONCILE_RESET_SENTINEL = Symbol("drawio.registry.reconcile.reset");

function resetDrawioRemountReconcileRefs(renderStateAppliedRef, registryRenderedBodyRef) {
  if (renderStateAppliedRef && typeof renderStateAppliedRef === "object") {
    renderStateAppliedRef.current = "";
  }
  if (registryRenderedBodyRef && typeof registryRenderedBodyRef === "object") {
    registryRenderedBodyRef.current = DRAWIO_REGISTRY_RECONCILE_RESET_SENTINEL;
  }
}

function runReconcileCycle({
  viewportNode,
  renderStateAppliedRef,
  renderStateSignature,
  registryRenderedBodyRef,
  registryRenderKey,
  registryRef,
  rebuildRegistry,
  layerMap,
  elementMap,
}) {
  if (renderStateAppliedRef.current === renderStateSignature) {
    return { skipped: true };
  }
  applyDrawioLayerRenderStateToDom(
    viewportNode,
    { interaction_mode: "edit", locked: false },
    null,
    { layerMap, elementMap },
  );
  if (registryRenderedBodyRef.current !== registryRenderKey || registryRef.current.size <= 0) {
    rebuildRegistry();
    registryRenderedBodyRef.current = registryRenderKey;
  }
  renderStateAppliedRef.current = renderStateSignature;
  return { skipped: false };
}

test("OFF path reset clears renderStateAppliedRef cache", () => {
  const renderStateAppliedRef = { current: "sig:stale" };
  const registryRenderedBodyRef = { current: "body:stale" };
  resetDrawioRemountReconcileRefs(renderStateAppliedRef, registryRenderedBodyRef);
  assert.equal(renderStateAppliedRef.current, "");
});

test("OFF path reset uses non-colliding sentinel for registryRenderedBodyRef cache", () => {
  const renderStateAppliedRef = { current: "sig:stale" };
  const registryRenderedBodyRef = { current: "" };
  resetDrawioRemountReconcileRefs(renderStateAppliedRef, registryRenderedBodyRef);
  assert.equal(typeof registryRenderedBodyRef.current, "symbol");
  assert.notEqual(registryRenderedBodyRef.current, "");
});

test("first reconcile after OFF->ON is not skipped even when signature is unchanged", () => {
  const renderStateSignature = "sig:same";
  const renderStateAppliedRef = { current: renderStateSignature };
  const registryRenderedBodyRef = { current: "body:key" };
  resetDrawioRemountReconcileRefs(renderStateAppliedRef, registryRenderedBodyRef);
  assert.notEqual(renderStateAppliedRef.current, renderStateSignature);
});

test("first reconcile after OFF->ON hides unmanaged nodes without View/Edit toggle", () => {
  const dom = new JSDOM("<svg><g id='Activity_ghost' data-drawio-el-id='Activity_ghost'></g></svg>");
  const previousElement = globalThis.Element;
  try {
    globalThis.Element = dom.window.Element;
    const viewportNode = dom.window.document.querySelector("svg");
    const ghostNode = dom.window.document.querySelector("#Activity_ghost");
    const renderStateSignature = "sig:stable";
    const renderStateAppliedRef = { current: renderStateSignature };
    const registryRenderedBodyRef = { current: "" };
    const registryRef = { current: new Map([["Activity_ghost", ghostNode]]) };
    let rebuildCount = 0;

    resetDrawioRemountReconcileRefs(renderStateAppliedRef, registryRenderedBodyRef);
    const cycle = runReconcileCycle({
      viewportNode,
      renderStateAppliedRef,
      renderStateSignature,
      registryRenderedBodyRef,
      registryRenderKey: "registry:key",
      registryRef,
      rebuildRegistry: () => {
        rebuildCount += 1;
      },
      layerMap: new Map(),
      elementMap: new Map(),
    });

    assert.equal(cycle.skipped, false);
    assert.equal(rebuildCount, 1);
    assert.equal(registryRenderedBodyRef.current, "registry:key");
    assert.equal(ghostNode.style.display, "none");
    assert.equal(ghostNode.style.pointerEvents, "none");
  } finally {
    globalThis.Element = previousElement;
    dom.window.close();
  }
});

test("first reconcile after OFF->ON still rebuilds when registryRenderKey is empty", () => {
  const dom = new JSDOM("<svg><g id='shape_1'></g></svg>");
  const previousElement = globalThis.Element;
  try {
    globalThis.Element = dom.window.Element;
    const viewportNode = dom.window.document.querySelector("svg");
    const renderStateSignature = "sig:empty-key";
    const renderStateAppliedRef = { current: renderStateSignature };
    const registryRenderedBodyRef = { current: "" };
    const registryRef = { current: new Map([["stale_node", {}]]) };
    let rebuildCount = 0;

    resetDrawioRemountReconcileRefs(renderStateAppliedRef, registryRenderedBodyRef);
    const cycle = runReconcileCycle({
      viewportNode,
      renderStateAppliedRef,
      renderStateSignature,
      registryRenderedBodyRef,
      registryRenderKey: "",
      registryRef,
      rebuildRegistry: () => {
        rebuildCount += 1;
        registryRef.current = new Map();
      },
      layerMap: new Map(),
      elementMap: new Map(),
    });

    assert.equal(cycle.skipped, false);
    assert.equal(rebuildCount, 1);
    assert.equal(registryRenderedBodyRef.current, "");
    assert.equal(registryRef.current.size, 0);
  } finally {
    globalThis.Element = previousElement;
    dom.window.close();
  }
});

test("initial mount without OFF state still reconciles normally", () => {
  const dom = new JSDOM("<svg><g id='shape_1'></g></svg>");
  const previousElement = globalThis.Element;
  try {
    globalThis.Element = dom.window.Element;
    const viewportNode = dom.window.document.querySelector("svg");
    const renderStateSignature = "sig:initial";
    const renderStateAppliedRef = { current: "" };
    const registryRenderedBodyRef = { current: "" };
    const registryRef = { current: new Map() };
    let rebuildCount = 0;

    const cycle = runReconcileCycle({
      viewportNode,
      renderStateAppliedRef,
      renderStateSignature,
      registryRenderedBodyRef,
      registryRenderKey: "registry:initial",
      registryRef,
      rebuildRegistry: () => {
        rebuildCount += 1;
      },
      layerMap: new Map([["DL1", { visible: true, locked: false, opacity: 1 }]]),
      elementMap: new Map([["shape_1", { id: "shape_1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1 }]]),
    });

    assert.equal(cycle.skipped, false);
    assert.equal(rebuildCount, 1);
    assert.equal(renderStateAppliedRef.current, renderStateSignature);
    assert.equal(registryRenderedBodyRef.current, "registry:initial");
  } finally {
    globalThis.Element = previousElement;
    dom.window.close();
  }
});
