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
const inlineSource = readSource("./diagramSearchInlineInput.jsx");
const panelSource = readSource("./diagramSearchInlinePanel.jsx");
const modeToggleSource = readSource("./diagramSearchModeToggle.jsx");

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
// D. Inline search / controls wiring contract
// ---------------------------------------------------------------------------

test("contract: inline panel caps rendered rows at 240 and groups rows by process context", () => {
  assert.equal(panelSource.includes("SEARCH_RESULTS_CAP"), true);
  assert.equal(panelSource.includes("groupSearchRows"), true);
  assert.equal(panelSource.includes('data-testid="diagram-action-search-group"'), true);
});

test("contract: inline panel shows result rows and no pagination", () => {
  assert.equal(panelSource.includes('data-testid="diagram-action-search-row"'), true);
  assert.equal(panelSource.includes("onSelect?.(index)"), true);
  assert.equal(panelSource.includes("diagram-action-search-active-index"), false, "pagination 1/N removed");
});

test("contract: controls wire inline search to controller handlers", () => {
  [
    "onModeChange={setDiagramSearchMode}",
    "onQueryChange={setDiagramSearchQuery}",
    "results={diagramSearchResults}",
    "onSelect={selectDiagramSearchResult}",
    "onMoveActive={moveDiagramSearchActive}",
    "onMoveActiveBoundary={moveDiagramSearchActiveBoundary}",
    "onActivate={activateDiagramSearchResult}",
    "<DiagramSearchInlineInput",
  ].forEach((snippet) => {
    assert.equal(controlsSource.includes(snippet), true, `controls must wire ${snippet}`);
  });
});

test("contract: toolbar exposes the search trigger and inline input ids", () => {
  assert.equal(controlsSource.includes("<DiagramSearchInlineInput"), true, "controls render inline search");
  assert.equal(inlineSource.includes('data-testid="diagram-action-search"'), true, "collapsed trigger testid");
  assert.equal(inlineSource.includes("diagram-action-search-popover"), true, "expanded popover testid");
  assert.equal(inlineSource.includes('id="diagram-search-query"'), true, "query input id");
  assert.equal(inlineSource.includes('data-testid="diagram-action-search-input"'), true, "query input testid");
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

test("contract S2: inline search autofocuses input, Escape stops propagation, blur collapses when empty", () => {
  assert.equal(inlineSource.includes("inputRef"), true);
  assert.equal(inlineSource.includes("node.focus()"), true);
  assert.equal(inlineSource.includes('event.key === "Escape"'), true);
  assert.equal(inlineSource.includes("event.stopPropagation()"), true);
  assert.equal(inlineSource.includes("applyTransition(\"blur\")"), true);
  assert.equal(inlineSource.includes("trapTabKeyEvent"), false, "Tab exits input (focus trap not used in inline widget)");
});

// ---------------------------------------------------------------------------
// F. Wave 1 S3 contract: debounce, keyboard navigation, no-select move
// ---------------------------------------------------------------------------

const controllerSource = readSource("./useDiagramSearchController.js");
const sectionsSource = readSource("../orchestration/buildDiagramControlsSections.js");

test("contract S3: inline input debounces query with raw pass-through", () => {
  assert.equal(inlineSource.includes("SEARCH_DEBOUNCE_MS"), true);
  assert.equal(inlineSource.includes("debouncerRef.current?.push(draft)"), true);
  assert.equal(inlineSource.includes("value={draft}"), true);
  assert.equal(inlineSource.includes("setDraft(event.target.value)"), true);
  assert.equal(inlineSource.includes("onQueryChangeRef.current?.(value)"), true);
  assert.equal(inlineSource.includes("toText(event.target.value)"), false);
});

test("contract S3: inline keyboard map — arrows move, Home/End jump, Enter activates", () => {
  [
    'event.key === "ArrowDown"',
    'event.key === "ArrowUp"',
    'event.key === "Home"',
    'event.key === "End"',
    'event.key === "Enter"',
    "onMoveActive?.(1)",
    "onMoveActive?.(-1)",
    'onMoveActiveBoundary?.("start")',
    'onMoveActiveBoundary?.("end")',
    'onActivate?.("enter")',
    "event.preventDefault()",
  ].forEach((snippet) => {
    assert.equal(inlineSource.includes(snippet), true, `inline input must include ${snippet}`);
  });
});

test("contract S3: controller exposes no-select move + explicit activate", () => {
  ["moveActive", "moveActiveBoundary", "activateActive", "clearQuery"].forEach((name) => {
    assert.equal(controllerSource.includes(name), true, `controller must expose ${name}`);
  });
  // moveActive must NOT route through focusResult (no selection.select/zoom on arrows)
  const moveStart = controllerSource.indexOf("const moveActive = useCallback");
  assert.notEqual(moveStart, -1);
  const moveBody = controllerSource.slice(moveStart, moveStart + 700);
  assert.equal(moveBody.includes("focusResult"), false, "moveActive must not call focusResult");
  assert.equal(moveBody.includes("resolveMoveIndex"), true);
  // activateActive is the explicit Enter path and DOES focus
  const activateStart = controllerSource.indexOf("const activateActive = useCallback");
  assert.notEqual(activateStart, -1);
  const activateBody = controllerSource.slice(activateStart, activateStart + 400);
  assert.equal(activateBody.includes("focusResult(result, source)"), true);
});

// ---------------------------------------------------------------------------
// G. Wave 1.1 toolbar redesign contract
// ---------------------------------------------------------------------------

test("contract redesign: inline input replaces popover and uses the same container ref", () => {
  assert.equal(controlsSource.includes("DiagramSearchPopover"), false, "controls must not use the old popover");
  assert.equal(controlsSource.includes("containerRef={diagramSearchPopoverRef}"), true);
  assert.equal(controlsSource.includes("<DiagramSearchInlineInput"), true);
});

test("contract redesign: mode toggle is wired with elements/properties tabs", () => {
  assert.equal(modeToggleSource.includes('data-testid="diagram-action-search-mode-elements"'), true);
  assert.equal(modeToggleSource.includes('data-testid="diagram-action-search-mode-properties"'), true);
  assert.equal(modeToggleSource.includes("resolveNextSearchMode"), true);
  assert.equal(controlsSource.includes("mode={diagramSearchMode}"), true);
  assert.equal(controlsSource.includes("onModeChange={setDiagramSearchMode}"), true);
  // Panel also exposes a compact mode chip in its header.
  assert.equal(panelSource.includes("diagramSearchInlineModeChip"), true);
});

test("contract redesign: Focus/Fullscreen are icon-only and moved after zoom controls", () => {
  const focusIdx = controlsSource.indexOf('data-testid="diagram-action-focus-mode"');
  const fullscreenIdx = controlsSource.indexOf('data-testid="diagram-action-fullscreen-mode"');
  const zoomInIdx = controlsSource.indexOf('data-testid="diagram-zoom-in"');
  const overflowIdx = controlsSource.indexOf('data-testid="diagram-action-overflow"');
  assert.ok(focusIdx > 0 && fullscreenIdx > 0 && zoomInIdx > 0 && overflowIdx > 0, "all required testids present");
  assert.ok(zoomInIdx < focusIdx, "Focus appears after zoom-in");
  assert.ok(focusIdx < overflowIdx, "Focus appears before overflow");
  assert.ok(zoomInIdx < fullscreenIdx, "Fullscreen appears after zoom-in");
  assert.ok(fullscreenIdx < overflowIdx, "Fullscreen appears before overflow");
  assert.equal(controlsSource.includes('className={`secondaryBtn diagramActionBtn diagramActionBtn--icon ${diagramFocusMode ? "isActive" : ""}`}'), true);
  assert.equal(controlsSource.includes('className={`secondaryBtn diagramActionBtn diagramActionBtn--icon ${diagramFullscreenActive ? "isActive" : ""}`}'), true);
});

test("contract S3: keyboard handlers are wired through sections and ProcessStage", () => {
  [
    "moveDiagramSearchActive",
    "moveDiagramSearchActiveBoundary",
    "activateDiagramSearchResult",
  ].forEach((key) => {
    assert.equal(sectionsSource.includes(`"${key}"`), true, `SEARCH_KEYS must include ${key}`);
    assert.equal(processStageSource.includes(`${key}: diagramSearch.`), true, `ProcessStage must pass ${key}`);
    assert.equal(controlsSource.includes(key), true, `controls must thread ${key}`);
  });
});
