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

test("DiagramSearchPopover renders grouped result sections without changing row selection contract", () => {
  assert.equal(source.includes("groupSearchRows(rows.slice(0, 240))"), true);
  assert.equal(source.includes('data-testid="diagram-action-search-group"'), true);
  assert.equal(source.includes('data-testid="diagram-action-search-group-header"'), true);
  assert.equal(source.includes("onSelect?.(index)"), true);
});

test("DiagramSearchPopover uses localized placeholders and empty states", () => {
  assert.equal(source.includes("id, название, метка или тип"), true);
  assert.equal(source.includes("название или значение свойства"), true);
  assert.equal(source.includes("Совпадений не найдено."), true);
});
