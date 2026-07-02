import test from "node:test";
import assert from "node:assert/strict";
import { buildMergePanelView } from "./BpmnMergePanel.model.js";

test("buildMergePanelView resolves local/server labels and conflict flags", () => {
  const view = buildMergePanelView({
    open: true,
    localXml: "<local/>",
    serverXml: "<server/>",
    localVersion: 3,
    serverVersion: 5,
    serverActorLabel: "Анна",
    currentUserId: "user_me",
    canEdit: true,
    source: "remote_toast",
  });
  assert.equal(view.open, true);
  assert.equal(view.localVersion, 3);
  assert.equal(view.serverVersion, 5);
  assert.equal(view.canAcceptLatest, true);
  assert.equal(view.canKeepMine, true);
  assert.equal(view.canCompare, true);
  assert.match(view.localLabel, /Ваша версия \(v3\)/);
  assert.match(view.serverLabel, /Последняя версия \(v5\) от Анна/);
  assert.match(view.lead, /Анна/);
});

test("buildMergePanelView disables keep-mine for readonly users", () => {
  const view = buildMergePanelView({
    open: true,
    localXml: "<local/>",
    serverXml: "<server/>",
    canEdit: false,
  });
  assert.equal(view.canKeepMine, false);
  assert.equal(view.canAcceptLatest, true);
});

test("buildMergePanelView handles missing XML", () => {
  const view = buildMergePanelView({
    open: true,
    localXml: "",
    serverXml: "",
  });
  assert.equal(view.canAcceptLatest, false);
  assert.equal(view.canKeepMine, false);
  assert.equal(view.canCompare, false);
});
