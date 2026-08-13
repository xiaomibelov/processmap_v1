import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const sharedModalSource = readFileSync(new URL("../../shared/ui/Modal.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker ${end}`);
  return source.slice(startIndex, endIndex);
}

test("SessionCreateModal uses shared design-system primitives and focuses the name input", () => {
  const modalSource = between("function SessionCreateModal(", "// \u2500\u2500\u2500 Root WorkspaceExplorer");
  assert.match(source, /import Button from "\.\.\/\.\.\/shared\/ui\/Button\.jsx";/);
  assert.match(source, /import SharedModal from "\.\.\/\.\.\/shared\/ui\/Modal\.jsx";/);
  assert.match(modalSource, /<SharedModal open title="Новая сессия"/);
  assert.match(modalSource, /<Button type="button" variant="secondary"/);
  assert.match(modalSource, /<Button type="submit" variant="primary"/);
  assert.match(modalSource, /inputRef\.current\?\.focus\(\)/);
  assert.match(modalSource, /<span className="label">Название сессии<\/span>/);
  assert.match(modalSource, /<legend className="label">Тип сессии<\/legend>/);
});

test("SessionCreateModal validates empty names and closes only after successful submit", () => {
  const modalSource = between("function SessionCreateModal(", "// \u2500\u2500\u2500 Root WorkspaceExplorer");
  assert.match(modalSource, /if \(busy\) return;/);
  assert.match(modalSource, /if \(!trimmedName\)/);
  assert.match(modalSource, /setError\("Введите название сессии"\)/);
  assert.match(modalSource, /disabled=\{busy \|\| !trimmedName\}/);
  assert.match(modalSource, /await onSubmit\?\.\(\{/);
  assert.match(modalSource, /name: trimmedName/);
  assert.match(modalSource, /onClose\?\.\(\);/);
  assert.match(modalSource, /finally[\s\S]*setBusy\(false\);/);
});

test("shared Modal implements Escape, backdrop close, and focus trap", () => {
  assert.match(sharedModalSource, /if \(e\.key === "Escape"\)/);
  assert.match(sharedModalSource, /if \(e\.target === e\.currentTarget\) onClose\?\.\(\);/);
  assert.match(sharedModalSource, /if \(e\.key !== "Tab"\) return;/);
  assert.match(sharedModalSource, /button:not\(\[disabled\]\)/);
  assert.match(sharedModalSource, /last\.focus\(\)/);
  assert.match(sharedModalSource, /first\.focus\(\)/);
});
