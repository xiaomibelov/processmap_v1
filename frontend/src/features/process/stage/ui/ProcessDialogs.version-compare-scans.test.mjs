import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STAGE_DIR = path.join(__dirname, "..", "..", "..", "..", "components");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start === -1) return "";
  const openBrace = source.indexOf("{", start + signature.length);
  if (openBrace === -1) return "";
  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

const DIALOGS = read(path.join(__dirname, "ProcessDialogs.jsx"));
const LIST = read(path.join(__dirname, "BpmnVersionList.jsx"));
const PANE = read(path.join(__dirname, "BpmnVersionComparePane.jsx"));
const PREVIEW = read(path.join(__dirname, "BpmnVersionPreview.jsx"));
const HEADER = read(path.join(__dirname, "BpmnVersionCompareHeader.jsx"));
const THEME_CSS = read(path.join(__dirname, "bpmn-version-preview.theme.css"));
const PROCESS_STAGE = read(path.join(STAGE_DIR, "ProcessStage.jsx"));

test("no native dialogs in version list, compare pane, and dialogs surface", () => {
  for (const [name, source] of [["BpmnVersionList.jsx", LIST], ["BpmnVersionComparePane.jsx", PANE]]) {
    assert.equal(source.includes("window.confirm"), false, `${name}: window.confirm запрещён`);
    assert.equal(source.includes("window.alert"), false, `${name}: window.alert запрещён`);
    assert.equal(source.includes("window.prompt"), false, `${name}: window.prompt запрещён`);
  }
  // ProcessDialogs: версионная модалка — без нативных диалогов; window.prompt
  // встречается только в прежнем (вне контура) флоу создания папки шаблонов.
  const promptCount = (DIALOGS.match(/window\.prompt/g) || []).length;
  assert.equal(DIALOGS.includes("window.confirm"), false, "ProcessDialogs.jsx: window.confirm запрещён");
  assert.equal(DIALOGS.includes("window.alert"), false, "ProcessDialogs.jsx: window.alert запрещён");
  assert.equal(promptCount, 1, "ProcessDialogs.jsx: допустим ровно один прежний window.prompt (папка шаблонов)");
  assert.equal(DIALOGS.includes('window.prompt("Название папки"'), true, "window.prompt принадлежит флоу папок шаблонов");
});

test("restoreSnapshot in ProcessStage has no native confirmation dialog", () => {
  const restoreBody = extractFunction(PROCESS_STAGE, "async function restoreSnapshot(item)");
  assert.notEqual(restoreBody, "", "restoreSnapshot не найден в ProcessStage.jsx");
  assert.equal(restoreBody.includes("window.confirm"), false, "restoreSnapshot: window.confirm запрещён");
  assert.equal(restoreBody.includes("window.alert"), false, "restoreSnapshot: window.alert запрещён");
  assert.equal(restoreBody.includes("window.prompt"), false, "restoreSnapshot: window.prompt запрещён");
  // Подтверждение восстановления — инлайн в шапке панели.
  assert.equal(PANE.includes("bpmn-versions-pane-restore-confirm"), true, "инлайн-подтверждение восстановления отсутствует");
});

test("vcc-* marker classes are defined in theme css and scoped to bpmnVersionPreview", () => {
  const kinds = ["added", "removed", "changed", "moved", "resized"];
  for (const kind of kinds) {
    assert.equal(
      THEME_CSS.includes(`.vcc-${kind}`),
      true,
      `маркер .vcc-${kind} не определён в bpmn-version-preview.theme.css`,
    );
  }
  assert.equal(THEME_CSS.includes(".bpmnVersionPreview"), true, "тема не привязана к .bpmnVersionPreview");
  // Маркеры применяются через canvas.addMarker с префиксом vcc.
  assert.equal(PREVIEW.includes('canvas.addMarker(id, cls)'), true, "addMarker не найден в BpmnVersionPreview");
  assert.equal(PREVIEW.includes('`${markerPrefix}-${kind}`'), true, "префикс маркера не найден в BpmnVersionPreview");
});

test("vcc-* markers do not collide with existing canvas marker classes", () => {
  const sources = [
    ["BpmnVersionList.jsx", LIST],
    ["BpmnVersionComparePane.jsx", PANE],
    ["BpmnVersionCompareHeader.jsx", HEADER],
    ["BpmnVersionPreview.jsx", PREVIEW],
  ];
  for (const [name, source] of sources) {
    assert.equal(source.includes("fpcSearchMatch"), false, `${name}: пересечение с fpcSearchMatch`);
    assert.equal(source.includes("fpcElementSelected"), false, `${name}: пересечение с fpcElementSelected`);
  }
  // Классы fpc* не переопределяются темой vcc.
  assert.equal(THEME_CSS.includes("fpcSearchMatch"), false, "тема vcc трогает fpcSearchMatch");
  assert.equal(THEME_CSS.includes("fpcElementSelected"), false, "тема vcc трогает fpcElementSelected");
});
