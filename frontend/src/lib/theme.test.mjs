import assert from "node:assert/strict";
import test from "node:test";

import { applyInitialTheme, resolveInitialTheme, THEME_STORAGE_KEY } from "./theme.js";

test("default theme is light when nothing stored", () => {
  assert.equal(resolveInitialTheme(""), "light");
  assert.equal(resolveInitialTheme(null), "light");
  assert.equal(resolveInitialTheme(undefined), "light");
});

test("unknown stored value falls back to light", () => {
  assert.equal(resolveInitialTheme("garbage"), "light");
  assert.equal(resolveInitialTheme("Dark"), "light");
  assert.equal(resolveInitialTheme("system"), "light");
});

test("stored light and dark choices are preserved", () => {
  assert.equal(resolveInitialTheme("light"), "light");
  assert.equal(resolveInitialTheme("dark"), "dark");
  assert.equal(resolveInitialTheme("  dark  "), "dark");
});

test("applyInitialTheme sets the root class for default and stored dark", () => {
  const root = { classList: new Set(["dark", "light"]) };
  const fakeRoot = {
    classList: {
      remove(...names) { names.forEach((n) => root.classList.delete(n)); },
      add(name) { root.classList.add(name); },
    },
  };
  assert.equal(applyInitialTheme(fakeRoot, null), "light");
  assert.deepEqual([...root.classList].sort(), ["light"]);
  assert.equal(applyInitialTheme(fakeRoot, "dark"), "dark");
  assert.deepEqual([...root.classList].sort(), ["dark"]);
});

test("storage key contract with localStorage consumers", () => {
  assert.equal(THEME_STORAGE_KEY, "fpc_theme");
});
