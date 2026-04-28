import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./DiagramSearchPopover.jsx", import.meta.url), "utf8");
const trimmedChangeHandler = "onQueryChange?.(toText" + "(event.target.value))";

test("DiagramSearchPopover passes raw input value to query state", () => {
  assert.equal(
    source.includes(trimmedChangeHandler),
    false,
  );
  assert.equal(
    source.includes("onQueryChange?.(event.target.value)"),
    true,
  );
});
