import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const notesContentSource = fs.readFileSync(new URL("./ElementNotesAccordionContent.jsx", import.meta.url), "utf8");
const topBarSource = fs.readFileSync(new URL("../TopBar.jsx", import.meta.url), "utf8");

test("NotesPanel wires anchored review handlers through notes section", () => {
  assert.match(notesPanelSource, /async function sendReviewComment\(\)/);
  assert.match(notesPanelSource, /onAddReviewComment/);
  assert.match(notesPanelSource, /onSetReviewCommentStatus/);
  assert.match(notesPanelSource, /onFocusReviewAnchor/);
  assert.match(notesPanelSource, /reviewComments=\{reviewList\}/);
});

test("ElementNotesAccordionContent renders review status and anchored comment controls", () => {
  assert.match(notesContentSource, /data-testid="review-v1-status-select"/);
  assert.match(notesContentSource, /data-testid="review-v1-comment-input"/);
  assert.match(notesContentSource, /data-testid="review-v1-comment-submit"/);
  assert.match(notesContentSource, /data-testid="review-v1-session-comments"/);
});

test("TopBar exposes review status menu actions", () => {
  assert.match(topBarSource, /topbar-session-review-menu/);
  assert.match(topBarSource, /data-testid=\{`topbar-review-action-\$\{option\.value\}`\}/);
  assert.match(topBarSource, /REVIEW_STATUS_OPTIONS/);
  assert.match(topBarSource, /handleReviewStatusChange/);
});
