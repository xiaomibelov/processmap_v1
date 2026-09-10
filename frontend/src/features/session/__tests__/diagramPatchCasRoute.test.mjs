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

/**
 * fix/save-single-writer-and-unified-cas-base (Task 4): прямые session-PATCH
 * с diagram-truth ключами (interview/nodes/edges/questions/bpmn_meta) обязаны
 * идти через meta pipeline (enqueueSessionPatchCasWrite) — tracker-first base
 * + per-session сериализация. Прямой PATCH остаётся только для meta-ключей
 * (title, notes_by_element, roles, status без base).
 */
test("App.jsx: diagram-key PATCH sites route via meta pipeline, meta keys stay direct", () => {
  const source = readSrc("App.jsx");
  // step-time (nodes+interview) и AI-комментарий (interview) — больше не прямые
  assert.equal(source.includes("apiPatchSession(sid, payload)"), false);
  assert.equal(source.includes("apiPatchSession(sid, { interview: nextInterview })"), false);
  // generic patchDraft — gated по diagram keys
  assert.equal(source.includes("hasDiagramPatchKeys(partial)"), true);
  assert.equal(source.includes("enqueueSessionPatchCasWrite({"), true);
  // meta-ключи остаются прямыми (нет CAS base у этих записей)
  assert.equal(source.includes("apiPatchSession(sid, { notes_by_element: nextMap })"), true);
  assert.equal(source.includes("apiPatchSession(sid, { title: nextTitle })"), true);
});

test("useDraft.js: generic patchDraft routes diagram keys via meta pipeline", () => {
  const source = readSrc("features/draft/hooks/useDraft.js");
  assert.equal(source.includes("hasDiagramPatchKeys(shaped)"), true);
  assert.equal(source.includes("enqueueSessionPatchCasWrite({"), true);
});

test("WorkspaceExplorer.jsx: status transition uses meta pipeline (CAS), title stays direct", () => {
  const source = readSrc("features/explorer/WorkspaceExplorer.jsx");
  assert.equal(source.includes("enqueueSessionPatchCasWrite({"), true);
  // единственный оставшийся прямой PATCH — title
  const directCount = (source.match(/await apiPatchSession\s*\(/g) || []).length;
  assert.equal(directCount, 1);
  assert.equal(source.includes("apiPatchSession(session.id, { title: name })"), true);
});
