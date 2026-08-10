import assert from "node:assert/strict";
import test from "node:test";

import {
  createTobeGhost,
  startTobeGhost,
  fixTobeGhost,
  cancelTobeGhost,
} from "./tobeGhostModel.js";

const PAYLOAD = {
  url: "https://docs.google.com/document/d/ABC123/edit",
  title: "Production Plan Q3",
};

test("createTobeGhost: builds ghost from url/title", () => {
  const ghost = createTobeGhost(PAYLOAD);
  assert.deepEqual(ghost, {
    url: PAYLOAD.url,
    title: PAYLOAD.title,
    x: null,
    y: null,
  });
});

test("createTobeGhost: empty title falls back to the url; empty url rejected", () => {
  const ghost = createTobeGhost({ url: "  https://example.com/doc  ", title: "  " });
  assert.equal(ghost.url, "https://example.com/doc");
  assert.equal(ghost.title, "https://example.com/doc");
  assert.equal(createTobeGhost({ url: "   ", title: "x" }), null);
  assert.equal(createTobeGhost(null), null);
});

test("startTobeGhost: starts when idle, ignored while a ghost is active", () => {
  const first = startTobeGhost(null, PAYLOAD);
  assert.ok(first, "ghost started");
  const second = startTobeGhost(first, { url: "https://example.com/other", title: "Other" });
  assert.equal(second, first, "single ghost at a time");
});

test("fixTobeGhost: produces a normalized document at the ghost position", () => {
  const ghost = startTobeGhost(null, PAYLOAD);
  const { ghost: nextGhost, document: doc } = fixTobeGhost(ghost, { x: 120.4, y: -40.6 });
  assert.equal(nextGhost, null);
  assert.ok(doc, "document created");
  assert.equal(doc.url, PAYLOAD.url);
  assert.equal(doc.title, PAYLOAD.title);
  assert.equal(doc.docId, "ABC123");
  assert.equal(doc.x, 120);
  assert.equal(doc.y, -41);
  assert.equal(doc.width, 240, "default shape size");
  assert.equal(doc.height, 160);
  assert.equal(doc.visible, true);
  assert.equal(doc.anchorElementId, null, "ghost-placed docs are free-floating");
});

test("fixTobeGhost: non-finite point falls back to origin; no ghost → no-op", () => {
  const ghost = startTobeGhost(null, PAYLOAD);
  const { document: doc } = fixTobeGhost(ghost, { x: "abc" });
  assert.equal(doc.x, 0);
  assert.equal(doc.y, 0);
  assert.deepEqual(fixTobeGhost(null, { x: 1, y: 2 }), { ghost: null, document: null });
});

test("cancelTobeGhost: drops the ghost without creating anything", () => {
  const ghost = startTobeGhost(null, PAYLOAD);
  assert.ok(ghost);
  assert.equal(cancelTobeGhost(ghost), null);
});
