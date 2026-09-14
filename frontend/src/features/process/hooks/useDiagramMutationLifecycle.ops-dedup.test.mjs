import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readHookSource() {
  return fs.readFileSync(path.join(__dirname, "useDiagramMutationLifecycle.js"), "utf8");
}

function extractQueueDiagramMutation(source) {
  const start = source.indexOf("const queueDiagramMutation = useCallback(");
  assert.notEqual(start, -1, "queueDiagramMutation must exist");
  const end = source.indexOf("\n  );", start);
  assert.notEqual(end, -1, "queueDiagramMutation end");
  return source.slice(start, end);
}

// Контур feature/async-save-pipeline-step1 — dedup full-save scheduling:
// когда SaveOutbox полностью захватил правку как ops, полное автосохранение
// для этой мутации не планируется (UI.md §2). Hook консультирует инжектированный
// предикат shouldSkipAutosaveSchedule внутри queueDiagramMutation — на уровне
// scheduling, до вызова scheduleDiagramAutosave. saveCoordinator core не
// затрагивается.
test("queueDiagramMutation consults shouldSkipAutosaveSchedule before scheduling", () => {
  const source = readHookSource();
  const body = extractQueueDiagramMutation(source);

  assert.ok(
    body.includes("shouldSkipAutosaveSchedule"),
    "queueDiagramMutation must consult shouldSkipAutosaveSchedule",
  );
  const pauseAt = body.indexOf("__FPC_E2E_PAUSE_AUTOSAVE__");
  const consultAt = body.indexOf("shouldSkipAutosaveSchedule");
  const scheduleAt = body.indexOf("scheduleDiagramAutosave({");
  assert.notEqual(pauseAt, -1, "E2E pause hook preserved");
  assert.ok(pauseAt < consultAt, "E2E pause hook keeps precedence over dedup consult");
  assert.ok(consultAt < scheduleAt, "dedup consult must happen before scheduleDiagramAutosave");
});

test("shouldSkipAutosaveSchedule is an optional hook option and never breaks scheduling on throw", () => {
  const source = readHookSource();
  assert.ok(
    /shouldSkipAutosaveSchedule\s*[,:}]/.test(source),
    "option must be accepted from the hook options",
  );
  const body = extractQueueDiagramMutation(source);
  assert.ok(
    body.includes("typeof shouldSkipAutosaveSchedule === \"function\""),
    "consult must be guarded so hooks without the option behave exactly as before",
  );
  assert.ok(
    /try\s*{[\s\S]*?shouldSkipAutosaveSchedule\(mutation\)/.test(body),
    "consult must be wrapped in try/catch — predicate failure falls back to scheduling",
  );
  assert.ok(
    source.includes("diagram.autosave_skipped_ops"),
    "skip path must be traced for diagnostics",
  );
});
