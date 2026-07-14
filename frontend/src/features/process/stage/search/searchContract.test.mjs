import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  collectDiagramSearchResults,
  normalizeDiagramSearchElement,
} from "./useDiagramSearchModel.js";
import {
  collectDiagramPropertySearchResults,
  normalizeDiagramPropertySearchEntry,
} from "./useDiagramPropertySearchModel.js";

// Guard-тесты контракта существующего поиска (Wave 1 / S1).
// Pure-node only: jsdom@28 несовместим с Node 18 в этом окружении
// (ERR_REQUIRE_ESM), поэтому поведенческие тесты хуков/рендера живут в e2e,
// а здесь фиксируем pure-модели + source-контракты.

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const imperativeApiSource = readSource("../../bpmn/stage/imperative/bpmnStageImperativeApi.js");
const bpmnStageSource = readSource("../../../../components/process/BpmnStage.jsx");
const searchCssSource = readSource("../../../../styles/app/05/05-02-bpmn-text-contrast.css");
const controlsSource = readSource("../ui/ProcessStageDiagramControls.jsx");
const popoverSource = readSource("../ui/DiagramSearchPopover.jsx");

// ---------------------------------------------------------------------------
// A. Element search model contract
// ---------------------------------------------------------------------------

test("contract: element model returns normalized rows with id/name/type fields", () => {
  const rows = collectDiagramSearchResults(
    [
      { elementId: "Task_A", name: "Alpha", type: "bpmn:Task" },
      { elementId: "Task_B", name: "Beta", type: "bpmn:ServiceTask", label: "Worker" },
    ],
    "task",
  );
  assert.equal(rows.length, 2);
  const first = rows[0];
  assert.equal(first.elementId, "Task_A");
  assert.equal(first.name, "Alpha");
  assert.equal(first.type, "bpmn:Task");
  assert.equal(first.typeLabel, "Task");
  assert.equal(typeof first.title, "string");
  assert.equal(typeof first.searchText, "string");
});

test("contract: element model matches case-insensitively by id, name, label, type and title", () => {
  const elements = [
    { elementId: "Task_0f3a", name: "", type: "bpmn:Task" },
    { elementId: "Task_Milk", name: "Перенести МОЛОКО", type: "bpmn:Task" },
    { elementId: "GW_1", name: "fork", type: "bpmn:ExclusiveGateway", label: "Развилка" },
    { elementId: "Sub_1", name: "prep", type: "bpmn:SubProcess", title: "Подготовка" },
  ];
  assert.deepEqual(collectDiagramSearchResults(elements, "0F3A").map((r) => r.elementId), ["Task_0f3a"]);
  assert.deepEqual(collectDiagramSearchResults(elements, "молоко").map((r) => r.elementId), ["Task_Milk"]);
  assert.deepEqual(collectDiagramSearchResults(elements, "gateway").map((r) => r.elementId), ["GW_1"]);
  assert.deepEqual(collectDiagramSearchResults(elements, "развилка").map((r) => r.elementId), ["GW_1"]);
  assert.deepEqual(collectDiagramSearchResults(elements, "подготовка").map((r) => r.elementId), ["Sub_1"]);
});

test("contract: element model dedupes by elementId and keeps first occurrence", () => {
  const rows = collectDiagramSearchResults(
    [
      { elementId: "Task_A", name: "first" },
      { elementId: "Task_A", name: "second" },
      { id: "Task_A", name: "third" },
    ],
    "task",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "first");
});

test("contract: element model returns empty list for blank query and tolerates garbage rows", () => {
  assert.deepEqual(collectDiagramSearchResults([{ elementId: "A", name: "a" }], ""), []);
  assert.deepEqual(collectDiagramSearchResults([{ elementId: "A", name: "a" }], "   "), []);
  assert.deepEqual(collectDiagramSearchResults(null, "a"), []);
  const rows = collectDiagramSearchResults([null, "x", {}, { name: "no-id" }, { elementId: "Ok", name: "ok" }], "ok");
  assert.deepEqual(rows.map((r) => r.elementId), ["Ok"]);
});

test("contract: normalizeDiagramSearchElement collapses whitespace and dedupes label equal to name", () => {
  const item = normalizeDiagramSearchElement({
    elementId: "  Task_X ",
    name: "Mix   Milk",
    label: "mix milk",
    type: "bpmn:Task",
  });
  assert.equal(item.elementId, "Task_X");
  assert.equal(item.name, "Mix   Milk");
  assert.equal(item.label, "");
  assert.equal(item.title, "mix milk");
  assert.equal(item.searchText.includes("mix milk"), true);
});

// ---------------------------------------------------------------------------
// B. Property search model contract
// ---------------------------------------------------------------------------

test("contract: property model matches by property name and value, keeps element context", () => {
  const entries = [
    {
      searchId: "Task_A::prop_0",
      elementId: "Task_A",
      elementTitle: "Call Worker",
      elementType: "bpmn:ServiceTask",
      propertyName: "container_tara",
      propertyValue: "Кастрюля",
    },
    {
      searchId: "Task_B::prop_0",
      elementId: "Task_B",
      elementTitle: "Retries",
      elementType: "bpmn:ServiceTask",
      propertyName: "retries",
      propertyValue: "3",
    },
  ];
  const byName = collectDiagramPropertySearchResults(entries, "CONTAINER_TARA");
  assert.equal(byName.length, 1);
  assert.equal(byName[0].elementId, "Task_A");
  const byValue = collectDiagramPropertySearchResults(entries, "кастрюля");
  assert.equal(byValue.length, 1);
  assert.equal(byValue[0].propertyValue, "Кастрюля");
  const byElement = collectDiagramPropertySearchResults(entries, "retries");
  assert.equal(byElement.length, 1);
  assert.equal(byElement[0].elementId, "Task_B");
});

test("contract: property model normalizes entries and rejects entries without elementId", () => {
  const entry = normalizeDiagramPropertySearchEntry({
    elementId: " Task_C ",
    propertyName: " object_ref ",
    propertyValue: " tank ",
  });
  assert.equal(entry.elementId, "Task_C");
  assert.equal(entry.propertyName, "object_ref");
  assert.equal(entry.propertyValue, "tank");
  assert.equal(normalizeDiagramPropertySearchEntry({ propertyName: "x" }), null);
  assert.deepEqual(collectDiagramPropertySearchResults(null, "x"), []);
});

// ---------------------------------------------------------------------------
// C. Imperative API contract (bpmnStageRef.current)
// ---------------------------------------------------------------------------

test("contract: imperative API exposes search surface used by the controller", () => {
  [
    "listSearchableElements",
    "listSearchableProperties",
    "setSearchHighlights",
    "clearSearchHighlights",
    "focusNode",
    "selectElements",
    "runDiagramContextAction",
    "whenReady",
  ].forEach((methodName) => {
    assert.equal(
      imperativeApiSource.includes(`${methodName}:`),
      true,
      `imperative API must expose ${methodName}`,
    );
  });
});

test("contract: selectElements supports focusFirst option and clears selection on empty ids", () => {
  assert.equal(imperativeApiSource.includes("selectElements: (idsRaw, options = {})"), true);
  assert.equal(imperativeApiSource.includes("focusFirst"), true);
  assert.equal(imperativeApiSource.includes("selection.select([])"), true);
});

test("contract: BpmnStage applies fpcSearchMatch/fpcSearchActive markers via canvas.addMarker", () => {
  assert.equal(bpmnStageSource.includes('canvas.addMarker(elementId, "fpcSearchMatch")'), true);
  assert.equal(bpmnStageSource.includes('canvas.addMarker(activeId, "fpcSearchActive")'), true);
  assert.equal(bpmnStageSource.includes("setSearchHighlightsOnInstance"), true);
  assert.equal(bpmnStageSource.includes("clearSearchHighlightsOnInstance"), true);
});

test("contract: clearSearchHighlights removes both marker classes from tracked elements", () => {
  const clearFnStart = bpmnStageSource.indexOf("function clearSearchHighlightsOnInstance");
  assert.notEqual(clearFnStart, -1);
  const clearFnBody = bpmnStageSource.slice(clearFnStart, clearFnStart + 1200);
  assert.equal(clearFnBody.includes("removeMarker"), true);
  assert.equal(clearFnBody.includes("fpcSearchMatch"), true);
  assert.equal(clearFnBody.includes("fpcSearchActive"), true);
});

test("contract: search markers are styled in the contrast CSS layer", () => {
  assert.equal(searchCssSource.includes(".djs-element.fpcSearchMatch"), true);
  assert.equal(searchCssSource.includes(".djs-element.fpcSearchActive"), true);
  assert.equal(searchCssSource.includes(".djs-connection.fpcSearchMatch"), true);
  assert.equal(searchCssSource.includes(".djs-connection.fpcSearchActive"), true);
});

// ---------------------------------------------------------------------------
// D. Popover / controls wiring contract
// ---------------------------------------------------------------------------

test("contract: popover caps rendered rows at 240 and groups rows by process context", () => {
  assert.equal(popoverSource.includes("rows.slice(0, 240)"), true);
  assert.equal(popoverSource.includes("groupSearchRows"), true);
  assert.equal(popoverSource.includes('data-testid="diagram-action-search-group"'), true);
});

test("contract: popover keeps Prev/Next disabled without results and reports active index chip", () => {
  assert.equal(popoverSource.includes("disabled={rows.length <= 0}"), true);
  assert.equal(popoverSource.includes('data-testid="diagram-action-search-active-index"'), true);
  assert.equal(popoverSource.includes("onSelect?.(index)"), true);
});

test("contract: controls wire popover to controller handlers (mode/query/results/prev/next/select)", () => {
  [
    "onModeChange={setDiagramSearchMode}",
    "onQueryChange={setDiagramSearchQuery}",
    "results={diagramSearchResults}",
    "onPrev={handleDiagramSearchPrev}",
    "onNext={handleDiagramSearchNext}",
    "onSelect={selectDiagramSearchResult}",
  ].forEach((snippet) => {
    assert.equal(controlsSource.includes(snippet), true, `controls must wire ${snippet}`);
  });
});

test("contract: toolbar exposes the search trigger button with stable test id", () => {
  assert.equal(controlsSource.includes('data-testid="diagram-action-search"'), true);
  assert.equal(controlsSource.includes('data-testid="diagram-action-search-popover"'), false, "popover test id lives in the popover component");
  assert.equal(popoverSource.includes('data-testid="diagram-action-search-popover"'), true);
  assert.equal(popoverSource.includes('data-testid="diagram-action-search-input"'), true);
});

// ---------------------------------------------------------------------------
// E. Wave 1 S2 contract: hotkey, overflow entry, focus management
// ---------------------------------------------------------------------------

const processStageSource = readSource("../../../../components/ProcessStage.jsx");

test("contract S2: ProcessStage wires Ctrl+K hotkey to open the search popover", () => {
  assert.equal(processStageSource.includes("useDiagramSearchHotkey"), true);
  assert.equal(processStageSource.includes("closeAllDiagramActions();"), true);
  assert.equal(processStageSource.includes("setDiagramActionSearchOpen(true);"), true);
});

test("contract S2: hotkey model ignores editable targets and requires Ctrl/Cmd+K", () => {
  const hotkeySource = readSource("./diagramSearchHotkey.js");
  assert.equal(hotkeySource.includes("isEditableEventTarget"), true);
  assert.equal(hotkeySource.includes("event.preventDefault()"), true);
  assert.equal(hotkeySource.includes('key !== "k"'), true);
  assert.equal(hotkeySource.includes("event.ctrlKey") && hotkeySource.includes("event.metaKey"), true);
});

test("contract S2: overflow menu contains a search entry with the Ctrl+K hint", () => {
  assert.equal(controlsSource.includes('label="Поиск (Ctrl+K)"'), true);
  assert.equal(controlsSource.includes("setSearchOpenSafe(true);"), true);
});

test("contract S2: popover autofocuses the query input and traps Tab inside", () => {
  assert.equal(popoverSource.includes("inputRef"), true);
  assert.equal(popoverSource.includes("node.focus()"), true);
  assert.equal(popoverSource.includes("trapTabKeyEvent(event, event.currentTarget)"), true);
  assert.equal(popoverSource.includes('event.key === "Escape"'), true);
  assert.equal(popoverSource.includes("event.stopPropagation()"), true);
});
