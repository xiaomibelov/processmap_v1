// UXF/B4: классификация источников TO BE (служебные — в «Прочие»).
import { test } from "vitest";
import assert from "node:assert/strict";
import { buildDerivedSet, classifySourceSessions, isServiceSession } from "./tobeSources.js";

test("B4: человеческие имена — в основном списке", () => {
  const { main, other } = classifySourceSessions([
    { id: "1", title: "Лагман с говядиной (v0.3)" },
    { id: "2", title: "Разогрев супа" },
  ]);
  assert.equal(main.length, 2);
  assert.equal(other.length, 0);
});

test("B4: подпроцессы — в «Прочие»", () => {
  assert.equal(isServiceSession({ title: "Подпроцесс: Activity_1k9t4a7" }), true);
  assert.equal(isServiceSession({ title: "Подпроцесс B" }), true);
  assert.equal(isServiceSession({ title: "Subprocess: payment" }), true);
});

test("B4: клавиатурный мусор и безымянные — в «Прочие»", () => {
  assert.equal(isServiceSession({ title: "fsefw" }), true);
  assert.equal(isServiceSession({ title: "" }), true);
  assert.equal(isServiceSession({ title: "   " }), true);
  assert.equal(isServiceSession({}), true);
  // но нормальные короткие/английские названия — не мусор
  assert.equal(isServiceSession({ title: "Суп" }), false);
  assert.equal(isServiceSession({ title: "Packaging" }), false);
});

test("B4: derived-set помечает источники с существующим TO BE", () => {
  const set = buildDerivedSet([
    { derived_from_session_id: "a1" },
    { derived_from_session_id: "a2" },
    {},
    { derived_from_session_id: "" },
  ]);
  assert.equal(set.has("a1"), true);
  assert.equal(set.has("a2"), true);
  assert.equal(set.has("a3"), false);
});
