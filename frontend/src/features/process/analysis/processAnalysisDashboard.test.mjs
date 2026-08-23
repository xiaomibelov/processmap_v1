// Tests for ProcessAnalysisDashboard skeleton/error/empty states.
// Run: node --test src/features/process/analysis/processAnalysisDashboard.test.mjs
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
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");

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
  const [dashboard, summaryTab] = await Promise.all([
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisDashboard.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisSummaryTab.jsx"),
  ]);
  return {
    ProcessAnalysisDashboard: dashboard.ProcessAnalysisDashboard,
    ProcessAnalysisSummaryTab: summaryTab.ProcessAnalysisSummaryTab,
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
    fetch: globalThis.fetch,
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
    globalThis.fetch = previous.fetch;
  };

  return { dom, root, cleanup, container };
}

async function flush(ms = 80) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

const FULL_VIEW_MODEL = {
  session_id: "s1",
  session_title: "Test Session",
  analysis: {
    derived: {
      process_metrics: {
        time: { active_min: 30, wait_min: 10, lead_min: 40, mainline_min: 30, throughput_steps_per_hour: 1.5 },
        counts: { steps_total: 3, steps_bound_to_bpmn: 2, tiers: { P0: 1, P1: 1, P2: 0, None: 1 } },
        coverage: {
          bind_percent: 67,
          ai: { total: 2, done: 1, open: 1, step_coverage_percent: 33 },
          boundaries: { filled: 3, total: 5, percent: 60 },
        },
        distributions: { by_type: [], by_lane: [], by_subprocess: [] },
        top_waits: [],
        extremes: { max_duration_step: null, max_wait_step: null },
        exceptions: { count: 0, add_min_total: 0 },
        quality: { errors_total: 0, warnings_total: 0, items: [] },
        path_metrics: { steps_count: 3, work_time_total_sec: 1800, wait_time_total_sec: 600, total_time_sec: 2400 },
        source_state: { source: "process_analysis_read_model", version: "v1", computed_at: 0, diagram_state_version: 0 },
      },
    },
  },
};

test("ProcessAnalysisDashboard renders skeleton while loading", async () => {
  const { ProcessAnalysisDashboard } = await loadModules();
  const { root, cleanup, container } = setupDom();
  globalThis.fetch = () => new Promise(() => {});

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisDashboard, {
          sessionId: "s1",
          externalViewModel: null,
          tabs: [],
          defaultTabKey: "summary",
          locale: "en",
        })
      );
    });
    await flush(30);
    assert.ok(container.querySelector('[data-testid="process-analysis-loading"]'));
  } finally {
    await cleanup();
  }
});

test("ProcessAnalysisDashboard renders empty state when no model", async () => {
  const { ProcessAnalysisDashboard } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisDashboard, {
          sessionId: "",
          tabs: [],
          defaultTabKey: "summary",
          locale: "en",
        })
      );
    });
    await flush();
    assert.ok(container.querySelector('[data-testid="process-analysis-empty"]'));
  } finally {
    await cleanup();
  }
});

test("ProcessAnalysisDashboard renders error state on load failure", async () => {
  const { ProcessAnalysisDashboard } = await loadModules();
  const { root, cleanup, container } = setupDom();
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: "server_error" }) });

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisDashboard, {
          sessionId: "s1",
          externalViewModel: null,
          tabs: [],
          defaultTabKey: "summary",
          locale: "en",
        })
      );
    });
    await flush(150);
    assert.ok(container.querySelector('[data-testid="process-analysis-error"]'));
  } finally {
    await cleanup();
  }
});

test("ProcessAnalysisDashboard renders model tabs and injects state props", async () => {
  const { ProcessAnalysisDashboard } = await loadModules();
  const { root, cleanup, container } = setupDom();

  function SummaryProbe({ model, loading, error, retry }) {
    return React.createElement(
      "div",
      { "data-testid": "summary-probe" },
      `model=${model ? "yes" : "no"} loading=${loading} error=${error || ""}`
    );
  }

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisDashboard, {
          sessionId: "s1",
          externalViewModel: FULL_VIEW_MODEL,
          tabs: [
            { key: "summary", label: "Summary", content: React.createElement(SummaryProbe) },
          ],
          defaultTabKey: "summary",
          locale: "en",
        })
      );
    });
    await flush();
    const probe = container.querySelector('[data-testid="summary-probe"]');
    assert.ok(probe);
    assert.match(probe.textContent, /model=yes/);
    assert.match(probe.textContent, /loading=false/);
  } finally {
    await cleanup();
  }
});

test("ProcessAnalysisDashboard summary tab renders KPI cards from model", async () => {
  const { ProcessAnalysisDashboard, ProcessAnalysisSummaryTab } = await loadModules();
  const { root, cleanup, container } = setupDom();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisDashboard, {
          sessionId: "s1",
          externalViewModel: FULL_VIEW_MODEL,
          tabs: [
            { key: "summary", label: "Summary", content: React.createElement(ProcessAnalysisSummaryTab) },
          ],
          defaultTabKey: "summary",
          locale: "en",
        })
      );
    });
    await flush();
    assert.ok(container.querySelector('[data-testid="summary-kpi-lead"]'));
    assert.ok(container.querySelector('[data-testid="summary-kpi-active"]'));
    assert.ok(container.querySelector('[data-testid="summary-kpi-wait"]'));
    assert.ok(container.querySelector('[data-testid="summary-kpi-throughput"]'));
    assert.match(container.textContent, /Lead time/);
    assert.match(container.textContent, /40/);
  } finally {
    await cleanup();
  }
});
