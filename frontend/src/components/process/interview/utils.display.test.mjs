import test from "node:test";
import assert from "node:assert/strict";

import { isDisplayNullishText, sanitizeDisplayText } from "./utils.js";

test("sanitizeDisplayText trims trailing nullish fragments", () => {
  assert.equal(sanitizeDisplayText("заказ на супNone", "—"), "заказ на суп");
  assert.equal(sanitizeDisplayText("заказ на суп null", "—"), "заказ на суп");
  assert.equal(sanitizeDisplayText("заказ на суп undefined", "—"), "заказ на суп");
});

test("sanitizeDisplayText returns fallback for nullish-only values", () => {
  assert.equal(sanitizeDisplayText("None", "—"), "—");
  assert.equal(sanitizeDisplayText("null", "—"), "—");
  assert.equal(sanitizeDisplayText("undefined", "—"), "—");
  assert.equal(isDisplayNullishText("None"), true);
  assert.equal(isDisplayNullishText("value"), false);
});
