import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (ревью-фикс B1):
// fanout source-contract staging/coordinator → BpmnStage render-effect.
//
// Каждый source, с которым staging/coordinator пишут в store XML,
// свежесериализованный из рантайм-моделера, обязан входить в
// isInternalModelerUpdate BpmnStage — иначе fanout обновит компонентный
// xml-state, render-effect не распознает апдейт как внутренний, хэш не
// совпадёт с lastModelerXmlHashRef и произойдёт ПОЛНЫЙ renderModeler
// (importXML) посреди drag / после positional-команды (regression B1).
// Source-contract: BpmnStage не импортируется в node --test (React),
// фиксируем списки источников на исходниках — по образцу
// bpmnSavePrimeHash.characterization.test.mjs.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSources() {
  return {
    stage: fs.readFileSync(
      path.join(__dirname, "../../../../components/process/BpmnStage.jsx"),
      "utf8",
    ),
    staging: fs.readFileSync(
      path.join(__dirname, "../coordinator/createLocalMutationStaging.js"),
      "utf8",
    ),
    coordinator: fs.readFileSync(
      path.join(__dirname, "../coordinator/createBpmnCoordinator.js"),
      "utf8",
    ),
  };
}

function internalSourcesOf(src) {
  const start = src.indexOf('const isInternalModelerUpdate = reason === "setXml"');
  assert.ok(start !== -1, "isInternalModelerUpdate block must exist");
  const tail = src.slice(start, start + 700);
  const end = tail.indexOf("if (modelerReady && isInternalModelerUpdate)");
  const block = end === -1 ? tail : tail.slice(0, end);
  return [...block.matchAll(/source === "([^"]+)"/g)].map((x) => x[1]);
}

function setXmlLiteralSources(...sources) {
  const out = new Set();
  for (const src of sources) {
    for (const mm of src.matchAll(/setXml\(\s*[^,]+?,\s*"([^"]+)"/g)) out.add(mm[1]);
    for (const mm of src.matchAll(/store\.setXml\(xml,\s*"([^"]+)"/g)) out.add(mm[1]);
  }
  return [...out];
}

test("CONTRACT: runtime-fresh setXml sources are covered by isInternalModelerUpdate", () => {
  const { stage, staging, coordinator } = readSources();
  const internal = internalSourcesOf(stage);
  const setXmlSources = setXmlLiteralSources(staging, coordinator);
  // Источники бэкенд/load-снапшотов не пишут modeler-fresh XML — вне покрытия.
  const runtimeOriginated = setXmlSources.filter(
    (s) => s !== "session_reload" && s !== "template_insert",
  );
  const missing = runtimeOriginated.filter((s) => !internal.includes(s));
  assert.deepEqual(
    missing,
    [],
    `setXml sources writing modeler-fresh XML must be internal-update sources, missing: ${missing.join(", ")}`,
  );
});

test("EVIDENCE: throttled serialization writes fresh runtime XML with its own source", () => {
  const { staging } = readSources();
  assert.ok(
    staging.includes('store.setXml(serializedXml, "runtime_change_throttled"'),
    "staging throttled tick must setXml with source runtime_change_throttled",
  );
  assert.ok(
    staging.includes("scheduleThrottledSerialization();"),
    "positional frames must schedule the throttled serialization",
  );
});

test("EVIDENCE: internal branch keeps view and primes hash instead of full re-import", () => {
  const { stage } = readSources();
  const start = stage.indexOf('const isInternalModelerUpdate = reason === "setXml"');
  assert.ok(start !== -1, "isInternalModelerUpdate block must exist");
  const branchStart = stage.indexOf("if (modelerReady && isInternalModelerUpdate)", start);
  assert.ok(branchStart !== -1, "internal-update branch must exist");
  const branch = stage.slice(branchStart, branchStart + 900);
  assert.ok(
    branch.includes("lastModelerXmlHashRef.current = resolvedHash;"),
    "internal branch must prime lastModelerXmlHashRef (keep_view, no re-import)",
  );
  assert.ok(
    !branch.includes("renderModeler("),
    "internal branch must not fall through to full renderModeler/importXML",
  );
});
