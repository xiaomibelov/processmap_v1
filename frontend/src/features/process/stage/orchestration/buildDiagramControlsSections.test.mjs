import test from "node:test";
import assert from "node:assert/strict";
import buildDiagramControlsSections from "./buildDiagramControlsSections.js";
import { buildDiagramControlsView } from "./buildDiagramViewModel.js";

test("buildDiagramControlsSections splits controls view into explicit section groups", () => {
  const base = {
    tab: "diagram",
    diagramActionBarRef: { current: null },
    setDiagramActionLayersOpen: () => {},
    drawioUiState: { enabled: true },
    diagramActionPlaybackOpen: true,
    playbackCanRun: true,
    diagramActionPathOpen: true,
    openPathsFromDiagram: () => {},
    templatesMenuOpen: true,
    openReportsFromDiagram: () => {},
    diagramActionOverflowOpen: true,
  };
  const sections = buildDiagramControlsSections(base);

  assert.equal(typeof sections, "object");
  assert.equal(sections.topbar.tab, "diagram");
  assert.equal(sections.drawioLayers.drawioUiState.enabled, true);
  assert.equal(sections.playbackAutopass.playbackCanRun, true);
  assert.equal(sections.pathsQuality.diagramActionPathOpen, true);
  assert.equal(sections.reportsTemplatesProblems.templatesMenuOpen, true);
  assert.equal(sections.overflowModes.diagramActionOverflowOpen, true);
});

test("buildDiagramControlsView preserves legacy fields and provides sectioned contract", () => {
  const base = {
    tab: "diagram",
    diagramActionOverflowOpen: false,
    openReportsFromDiagram: () => {},
  };
  const view = buildDiagramControlsView(base);

  assert.equal(view.tab, "diagram");
  assert.equal(typeof view.sections, "object");
  assert.equal(view.sections.topbar.tab, "diagram");
  assert.equal(typeof view.sections.reportsTemplatesProblems.openReportsFromDiagram, "function");
});
