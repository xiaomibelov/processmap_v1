import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../..");

function walkSources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSources(full));
    } else if (/\.(js|jsx|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.mjs")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * fix/save-single-writer-and-unified-cas-base (Task 6): контракт единого
 * писателя. Один источник CAS base (casVersionTracker), одна очередь записи
 * (saveCoordinator per-session), одна реализация чтения CAS-полей
 * (casResponse.js). Тест стоит на страже против возврата дублирующих
 * реализаций и новых прямых write-path'ов вне контракта.
 */

// Файлы, где прямые вызовы apiPatchSession/apiPutBpmnXml разрешены:
// - определение API-клиента и pipeline-транспорты (единственный законный
//   путь записи через saveCoordinator);
// - Task 3: прямые PUT вне pipelines с обязательным tracker sync
//   (guard: directBpmnPutTrackerSync.test.mjs; TODO architecture T3/T5);
// - Task 4: meta-ключи (title/notes/roles) без CAS — осознанно прямые.
const DIRECT_WRITER_ALLOWLIST = new Set([
  "features/process/bpmn/persistence/createBpmnPersistence.js",
  "features/process/save/saveBpmnState.js",
  "features/process/stage/utils/sessionPatchCasCoordinator.js",
  "features/process/analysis/interviewAnalysisPatchHelper.js",
  "components/ProcessStage.jsx",
  "App.jsx",
  "app/useSessionActivationOrchestration.js",
  "features/draft/hooks/useDraft.js",
  "features/explorer/WorkspaceExplorer.jsx",
]);

const WRITER_CALL_RE = /(?:await|return)\s+(?:payload\.)?api(?:PatchSession|PutBpmnXml)\s*\(/;

// Маркеры дублирующих CAS candidate-chain реализаций (канон — casResponse.js).
// Ловим envelope-diving частные читатели конфликт-ответа (data.detail /
// errorDetails / details вложенность) — именно они расходились между копиями.
// Одноуровневые коэрсии вида `value.diagram_state_version ?? value.diagramStateVersion`
// (гидрация, UI-маппинг, api-клиент) — легальны и не ловятся.
const DUPLICATE_CHAIN_RES = [
  /data\?\.detail\?\.server_current_version/,
  /errorDetails\?\.server_current_version/,
  /details\?\.server_current_version/,
];

test("saveWriterContract: direct apiPatchSession/apiPutBpmnXml calls stay inside the allowlist", () => {
  const offenders = [];
  for (const file of walkSources(SRC_ROOT)) {
    const rel = path.relative(SRC_ROOT, file);
    if (rel === "lib/api.js") continue; // определения клиента
    const source = fs.readFileSync(file, "utf8");
    if (!WRITER_CALL_RE.test(source)) continue;
    if (!DIRECT_WRITER_ALLOWLIST.has(rel)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `new direct writer paths outside the save-writer contract: ${offenders.join(", ")}`,
  );
});

test("saveWriterContract: no duplicated CAS candidate chains outside casResponse.js", () => {
  const offenders = [];
  for (const file of walkSources(SRC_ROOT)) {
    const rel = path.relative(SRC_ROOT, file);
    if (rel === "features/session/casResponse.js") continue;
    const source = fs.readFileSync(file, "utf8");
    for (const re of DUPLICATE_CHAIN_RES) {
      if (re.test(source)) {
        offenders.push(`${rel} (${re.source})`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `duplicated CAS parsing logic (canonical impl: features/session/casResponse.js): ${offenders.join(", ")}`,
  );
});
