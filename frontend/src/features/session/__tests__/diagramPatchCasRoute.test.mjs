// Guard-тесты P0 (fix/canvas-editing-stability): маршрутизация session-PATCH.
//
// Диаграммные по backend-семантике ключи (nodes/edges/interview/questions/
// bpmn_meta/bpmn_xml) обязаны идти через meta pipeline (enqueueSessionPatchCasWrite)
// — tracker-first base в момент отправки + ack синкает casVersionTracker.
// Прямой apiPatchSession остаётся только для metadata-ключей (title, notes,
// notes_by_element, roles, status) — CAS их не требует.
//
// Адаптация canonical 018d1b46 (fix/save-single-writer-and-unified-cas-base)
// под main: WorkspaceExplorer НЕ входит в контур (status — metadata-ключ,
// остаётся прямым по решению контура).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath) {
  return fs.readFileSync(path.join(SRC_ROOT, relPath), "utf8");
}

test("patchKeys.js: единая реализация gate (правило одной реализации)", () => {
  const source = readSrc("features/session/patchKeys.js");
  for (const key of ["bpmn_meta", "interview", "nodes", "edges", "questions"]) {
    assert.ok(source.includes(`"${key}"`), `patchKeys.js must gate "${key}"`);
  }
  assert.ok(source.includes("hasDiagramPatchKeys"), "hasDiagramPatchKeys export");
  assert.ok(source.includes("classifySessionPatch"), "classifySessionPatch export");
});

function hasDirectStatement(source, statement) {
  const normalized = statement.endsWith(";") ? statement : `${statement};`;
  const forms = new Set([normalized, `const r = ${normalized}`]);
  return source.split("\n").some((line) => forms.has(line.trim()));
}

test("App.jsx: diagram-key PATCH sites route via meta pipeline, meta keys stay direct", () => {
  const source = readSrc("App.jsx");
  // Бывшие прямые записи с diagram-ключами — больше не безусловные statement'ы
  // (остаются только как metadata-fallback ветки gate после ": ").
  assert.equal(hasDirectStatement(source, "await apiPatchSession(sid, payload);"), false,
    "setElementStepTime payload must not be an unconditional direct PATCH");
  assert.equal(hasDirectStatement(source, "await apiPatchSession(sid, { interview: nextInterview });"), false,
    "updateElementAiQuestion interview must not be an unconditional direct PATCH");
  // Gate присутствует на всех трёх сайтах.
  assert.equal(source.includes("hasDiagramPatchKeys(payload)"), true, "setElementStepTime gate");
  assert.equal(source.includes("hasDiagramPatchKeys({ interview: nextInterview })"), true, "AI-question gate");
  assert.equal(source.includes("hasDiagramPatchKeys(partial)"), true, "generic patchDraft gate");
  assert.ok((source.match(/enqueueSessionPatchCasWrite\(\{/g) || []).length >= 3,
    "all three diagram sites must call enqueueSessionPatchCasWrite");
  // Meta-ключи остаются прямыми (fallback-ветки gate).
  assert.equal(source.includes("apiPatchSession(sid, { notes_by_element: nextMap })"), true);
  assert.equal(source.includes("apiPatchSession(sid, { title: nextTitle })"), true);
});

test("useDraft.js: generic patchDraft routes diagram keys via meta pipeline", () => {
  const source = readSrc("features/draft/hooks/useDraft.js");
  assert.equal(source.includes("hasDiagramPatchKeys(shaped)"), true);
  assert.equal(source.includes("enqueueSessionPatchCasWrite({"), true);
  assert.equal(hasDirectStatement(source, "await apiPatchSession(sid, shaped);"), false,
    "full-draft patch must not be an unconditional direct PATCH");
});

test("sessionPatchCasCoordinator.js: re-export единой реализации gate", () => {
  const source = readSrc("features/process/stage/utils/sessionPatchCasCoordinator.js");
  assert.ok(source.includes('from "../../../../features/session/patchKeys.js"'), "delegate import");
  assert.ok(source.includes("hasDiagramPatchKeys"), "re-export present");
});
