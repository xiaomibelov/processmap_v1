import assert from "node:assert/strict";
import test from "node:test";

import {
  BPMN123_DEFAULT_LEVEL_ID,
  resolveBpmn123Route,
} from "./bpmn123RouteModel.js";

test("/app/bpmn123 opens the default Level 1 alias", () => {
  const route = resolveBpmn123Route("/app/bpmn123");

  assert.equal(route.isBpmn123Route, true);
  assert.equal(route.isDefaultAlias, true);
  assert.equal(route.levelId, BPMN123_DEFAULT_LEVEL_ID);
});

test("/app/bpmn123/level/:levelId opens that level", () => {
  const route = resolveBpmn123Route("/app/bpmn123/level/bpmn1-level1-first-process");

  assert.equal(route.isBpmn123Route, true);
  assert.equal(route.isDefaultAlias, false);
  assert.equal(route.levelId, "bpmn1-level1-first-process");
});

test("ordinary ProcessMap routes do not resolve as BPMN 123", () => {
  assert.equal(resolveBpmn123Route("/app").isBpmn123Route, false);
  assert.equal(resolveBpmn123Route("/app?project=x&session=y").isBpmn123Route, false);
  assert.equal(resolveBpmn123Route("/app/bpmn123x").isBpmn123Route, false);
});
