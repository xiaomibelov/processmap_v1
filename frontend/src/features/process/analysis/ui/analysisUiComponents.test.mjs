// Tests for analysis redesign reusable UI components.
// Run: node --test src/features/process/analysis/ui/analysisUiComponents.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../../..");

let viteServer = null;

async function loadModules() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  const [
    empty,
    skeleton,
    error,
    kpi,
    virtual,
    branches,
    steps,
  ] = await Promise.all([
    viteServer.ssrLoadModule("/src/features/process/analysis/ui/AnalysisEmptyState.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ui/AnalysisSkeleton.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ui/AnalysisErrorState.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ui/AnalysisKpiCard.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ui/VirtualTable.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ui/VirtualBranchesTable.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ui/VirtualStepsTable.jsx"),
  ]);
  return {
    AnalysisEmptyState: empty.AnalysisEmptyState,
    AnalysisSkeleton: skeleton.AnalysisSkeleton,
    AnalysisErrorState: error.AnalysisErrorState,
    AnalysisKpiCard: kpi.AnalysisKpiCard,
    VirtualTable: virtual.VirtualTable,
    VirtualBranchesTable: branches.VirtualBranchesTable,
    VirtualStepsTable: steps.VirtualStepsTable,
  };
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = async () => {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
  };

  return { dom, root, cleanup, container };
}

async function flush(ms = 50) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

test("AnalysisEmptyState renders title, description and CTAs", async () => {
  const {
    AnalysisEmptyState,
  } = await loadModules();
  const { root, cleanup, container } = setupDom();
  let primaryClicked = 0;
  let secondaryClicked = 0;

  try {
    await act(async () => {
      root.render(
        React.createElement(AnalysisEmptyState, {
          title: "No data",
          description: "Add a step.",
          primaryAction: { label: "Add", onClick: () => { primaryClicked += 1; } },
          secondaryAction: { label: "Cancel", onClick: () => { secondaryClicked += 1; } },
        })
      );
    });
    await flush();
    assert.match(container.textContent, /No data/);
    assert.match(container.textContent, /Add a step\./);
    assert.match(container.textContent, /Add/);
    assert.match(container.textContent, /Cancel/);
  } finally {
    await cleanup();
  }
});

test("AnalysisSkeleton renders card and table variants", async () => {
  const {
    AnalysisSkeleton,
  } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(React.createElement(AnalysisSkeleton, { variant: "card", count: 3 }));
    });
    await flush();
    assert.ok(container.querySelector('[data-testid="analysis-skeleton-cards"]'));
    assert.equal(container.querySelectorAll('[data-testid="analysis-skeleton-card"]').length, 3);

    await act(async () => {
      root.render(React.createElement(AnalysisSkeleton, { variant: "table", count: 2, columns: 3 }));
    });
    await flush();
    assert.ok(container.querySelector('[data-testid="analysis-skeleton-table"]'));
  } finally {
    await cleanup();
  }
});

test("AnalysisErrorState renders title, message and retry", async () => {
  const {
    AnalysisErrorState,
  } = await loadModules();
  const { root, cleanup, container } = setupDom();
  let retries = 0;

  try {
    await act(async () => {
      root.render(
        React.createElement(AnalysisErrorState, {
          title: "Failed",
          message: "Network error",
          onRetry: () => { retries += 1; },
          retryLabel: "Retry",
        })
      );
    });
    await flush();
    assert.match(container.textContent, /Failed/);
    assert.match(container.textContent, /Network error/);
    const btn = container.querySelector('[data-testid="analysis-error-retry"]');
    assert.ok(btn);
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(retries, 1);
  } finally {
    await cleanup();
  }
});

test("AnalysisKpiCard renders value, label and unit", async () => {
  const {
    AnalysisKpiCard,
  } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(
        React.createElement(AnalysisKpiCard, {
          value: "42",
          label: "Lead time",
          unit: "min",
        })
      );
    });
    await flush();
    assert.match(container.textContent, /42/);
    assert.match(container.textContent, /Lead time/);
    assert.match(container.textContent, /min/);
    assert.ok(container.querySelector('[data-testid="analysis-kpi-card"]'));
  } finally {
    await cleanup();
  }
});

test("VirtualTable renders rows and header", async () => {
  const {
    VirtualTable,
  } = await loadModules();
  const { root, cleanup, container } = setupDom();

  const rows = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
  ];

  try {
    await act(async () => {
      root.render(
        React.createElement(VirtualTable, {
          rows,
          rowHeight: 32,
          height: 160,
          renderHeader: () => React.createElement("div", { role: "row" }, "Name"),
          renderRow: (row) => React.createElement("div", null, row.name),
        })
      );
    });
    await flush();
    assert.ok(container.querySelector('[data-testid="virtual-table"]'));
    assert.match(container.textContent, /Alpha/);
    assert.match(container.textContent, /Beta/);
    assert.match(container.textContent, /Gamma/);
  } finally {
    await cleanup();
  }
});

test("VirtualTable renders emptyState when rows empty", async () => {
  const {
    VirtualTable,
  } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(
        React.createElement(VirtualTable, {
          rows: [],
          renderRow: () => null,
          emptyState: React.createElement("div", null, "Nothing here"),
        })
      );
    });
    await flush();
    assert.ok(container.querySelector('[data-testid="virtual-table-empty"]'));
    assert.match(container.textContent, /Nothing here/);
  } finally {
    await cleanup();
  }
});

function makeTransitions(count) {
  return Array.from({ length: count }, (_, i) => ({
    key: `t_${i}`,
    from_node_id: `from_${i}`,
    to_node_id: `to_${i}`,
    from_title: `From ${i}`,
    to_title: `To ${i}`,
    from_lane: "",
    to_lane: "",
    when: i % 2 === 0 ? `Condition ${i}` : "",
  }));
}

test("VirtualBranchesTable renders a large transition list without crashing", async () => {
  const { VirtualBranchesTable } = await loadModules();
  const { root, cleanup, container } = setupDom();
  const transitions = makeTransitions(1000);

  try {
    await act(async () => {
      root.render(
        React.createElement(VirtualBranchesTable, {
          transitions,
          tableHeight: 360,
          onSaveEdit: () => {},
          "data-testid": "branches-virtual-table",
        })
      );
    });
    await flush(100);
    assert.ok(container.querySelector('[data-testid="branches-virtual-table"]'));
    assert.ok(container.textContent.includes("From 0"));
    assert.ok(container.textContent.includes("To 999") || container.querySelectorAll('[role="row"]').length > 0);
  } finally {
    await cleanup();
  }
});

function makeSteps(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `s_${i}`,
    action: `Step ${i}`,
    lane_name: `Lane ${i % 5}`,
    node_bound: i % 3 === 0,
    node_bind_id: `node_${i}`,
    tier: i % 4 === 0 ? "P0" : "None",
    _order_index: i + 1,
  }));
}

test("VirtualStepsTable renders a large step list without crashing", async () => {
  const { VirtualStepsTable } = await loadModules();
  const { root, cleanup, container } = setupDom();
  const steps = makeSteps(1000);

  try {
    await act(async () => {
      root.render(
        React.createElement(VirtualStepsTable, {
          steps,
          selectedStepIds: [],
          activeStepId: "",
          onToggleStepSelection: () => {},
          onToggleAllStepSelection: () => {},
          onActivateStep: () => {},
          patchStep: () => {},
          productActionCountByStepId: {},
          tableHeight: 420,
        })
      );
    });
    await flush(100);
    assert.ok(container.querySelector('[data-testid="virtual-steps-table"]'));
    assert.ok(container.textContent.includes("Step 0"));
    assert.ok(container.querySelectorAll('[data-testid="analysis-step-list-row"]').length > 0);
  } finally {
    await cleanup();
  }
});
