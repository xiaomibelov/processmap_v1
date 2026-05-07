import test from "node:test";
import assert from "node:assert/strict";

import { buildAppWorkspaceHref, buildProductActionsRegistryHref, shouldHandleClientNavigation } from "./appLinkBehavior.js";

function makeEvent(overrides = {}) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  };
}

test("buildAppWorkspaceHref builds /app without selection", () => {
  assert.equal(buildAppWorkspaceHref(), "/app");
});

test("buildAppWorkspaceHref builds project/session selection route", () => {
  assert.equal(buildAppWorkspaceHref({ projectId: "p_1", sessionId: "s_2" }), "/app?project=p_1&session=s_2");
  assert.equal(buildAppWorkspaceHref({ projectId: "p_1" }), "/app?project=p_1");
});

test("buildProductActionsRegistryHref builds product registry surface routes", () => {
  assert.equal(
    buildProductActionsRegistryHref({ scope: "workspace", workspaceId: "ws_1" }),
    "/app?surface=product-actions-registry&registry_scope=workspace&workspace=ws_1",
  );
  assert.equal(
    buildProductActionsRegistryHref({ scope: "project", workspaceId: "ws_1", projectId: "p_1" }),
    "/app?surface=product-actions-registry&registry_scope=project&workspace=ws_1&project=p_1",
  );
  assert.equal(
    buildProductActionsRegistryHref({ scope: "session", projectId: "p_1", sessionId: "s_2" }),
    "/app?surface=product-actions-registry&registry_scope=session&project=p_1&session=s_2",
  );
});

test("shouldHandleClientNavigation accepts plain left click", () => {
  assert.equal(shouldHandleClientNavigation(makeEvent()), true);
});

test("shouldHandleClientNavigation rejects modified clicks", () => {
  assert.equal(shouldHandleClientNavigation(makeEvent({ ctrlKey: true })), false);
  assert.equal(shouldHandleClientNavigation(makeEvent({ metaKey: true })), false);
  assert.equal(shouldHandleClientNavigation(makeEvent({ shiftKey: true })), false);
});

test("shouldHandleClientNavigation rejects non-left buttons and prevented events", () => {
  assert.equal(shouldHandleClientNavigation(makeEvent({ button: 1 })), false);
  assert.equal(shouldHandleClientNavigation(makeEvent({ defaultPrevented: true })), false);
});

test("shouldHandleClientNavigation respects non-self targets", () => {
  assert.equal(shouldHandleClientNavigation(makeEvent(), "_blank"), false);
});
