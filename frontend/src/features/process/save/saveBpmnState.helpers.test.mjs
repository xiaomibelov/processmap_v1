import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  derivePropertySourceAction,
  buildFallbackSessionPatch,
  applyPropertyOperation,
  pickDiagramStateVersion,
  isDiagramStateConflict,
  resolveBaseDiagramStateVersion,
} from "./saveBpmnState.helpers.js";
import { setVersion, __resetForTests } from "../../../lib/casVersionTracker.js";

describe("saveBpmnState.helpers", () => {
  beforeEach(() => {
    __resetForTests();
  });

  it("pickDiagramStateVersion reads snake, camel and numeric strings", () => {
    assert.equal(pickDiagramStateVersion({ diagram_state_version: 5 }), 5);
    assert.equal(pickDiagramStateVersion({ diagramStateVersion: 7 }), 7);
    assert.equal(pickDiagramStateVersion({ diagram_state_version: "3.7" }), 4);
    assert.equal(pickDiagramStateVersion(null), null);
    assert.equal(pickDiagramStateVersion({ diagram_state_version: -1 }), null);
    assert.equal(pickDiagramStateVersion({ diagram_state_version: "nope" }), null);
  });

  it("isDiagramStateConflict detects 409 status or marker", () => {
    assert.equal(isDiagramStateConflict({ status: 409 }), true);
    assert.equal(isDiagramStateConflict({ status: 200, error: "DIAGRAM_STATE_CONFLICT" }), true);
    assert.equal(isDiagramStateConflict({ status: 200, text: "diagram_state_conflict" }), true);
    assert.equal(isDiagramStateConflict({ status: 200, error: "other" }), false);
    assert.equal(isDiagramStateConflict(null), false);
    assert.equal(isDiagramStateConflict({ status: 423 }), false);
  });

  it("resolveBaseDiagramStateVersion prefers tracked > getter > option > 0", () => {
    assert.equal(resolveBaseDiagramStateVersion("s1", {}), 0);
    assert.equal(resolveBaseDiagramStateVersion("s1", { baseDiagramStateVersion: 12 }), 12);
    assert.equal(
      resolveBaseDiagramStateVersion("s1", { getBaseDiagramStateVersion: () => 15 }),
      15,
    );

    setVersion("s1", 20);
    assert.equal(resolveBaseDiagramStateVersion("s1", {}), 20);
    assert.equal(
      resolveBaseDiagramStateVersion("s1", {
        getBaseDiagramStateVersion: () => 15,
        baseDiagramStateVersion: 12,
      }),
      20,
    );
  });

  it("derivePropertySourceAction classifies add/update/delete", () => {
    assert.equal(derivePropertySourceAction({}, { a: {} }, "a"), "property_add");
    assert.equal(derivePropertySourceAction({ a: {} }, { a: {} }, "a"), "property_update");
    assert.equal(derivePropertySourceAction({ a: {} }, {}, "a"), "property_delete");
  });

  it("buildFallbackSessionPatch builds expected shape", () => {
    const patch = buildFallbackSessionPatch({
      sid: "abc",
      nextXml: "<x/>",
      nextMeta: { foo: 1 },
      storedRev: 7,
      diagramStateVersion: 9,
      syncSource: "test",
    });
    assert.equal(patch.id, "abc");
    assert.equal(patch.session_id, "abc");
    assert.equal(patch.bpmn_xml, "<x/>");
    assert.deepEqual(patch.bpmn_meta, { foo: 1 });
    assert.equal(patch.bpmn_xml_version, 7);
    assert.equal(patch.version, 7);
    assert.equal(patch.diagram_state_version, 9);
    assert.equal(patch._sync_source, "test");
  });

  it("applyPropertyOperation adds, updates and deletes properties", () => {
    const added = applyPropertyOperation("property_add", {}, {
      elementId: "e1",
      propertyName: "foo",
      propertyValue: "bar",
    });
    assert.equal(Object.keys(added).length, 1);
    assert.equal(added.e1.properties.extensionProperties.length, 1);
    assert.equal(added.e1.properties.extensionProperties[0].name, "foo");
    assert.equal(added.e1.properties.extensionProperties[0].value, "bar");

    const updated = applyPropertyOperation("property_update", added, {
      elementId: "e1",
      propertyName: "foo",
      propertyValue: "baz",
    });
    assert.equal(updated.e1.properties.extensionProperties.length, 1);
    assert.equal(updated.e1.properties.extensionProperties[0].value, "baz");

    const deletedName = applyPropertyOperation("property_delete", updated, {
      elementId: "e1",
      propertyName: "foo",
    });
    assert.equal(Object.keys(deletedName).length, 0);

    const deletedElement = applyPropertyOperation("property_delete", deletedName, {
      elementId: "e1",
    });
    assert.equal(Object.keys(deletedElement).length, 0);
  });
});
