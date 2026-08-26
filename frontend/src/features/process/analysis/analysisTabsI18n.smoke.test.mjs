// Smoke + i18n-leak test for all 6 Process Analysis tabs.
// Run: node --test src/features/process/analysis/analysisTabsI18n.smoke.test.mjs
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
  const [
    dashboard,
    boundaries,
    steps,
    branches,
    summary,
    exceptions,
    ai,
  ] = await Promise.all([
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisDashboard.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisBoundariesTab.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisStepsTab.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisBranchesTab.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisSummaryTab.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisExceptionsTab.jsx"),
    viteServer.ssrLoadModule("/src/features/process/analysis/ProcessAnalysisAiTab.jsx"),
  ]);
  return {
    ProcessAnalysisDashboard: dashboard.ProcessAnalysisDashboard,
    ProcessAnalysisBoundariesTab: boundaries.ProcessAnalysisBoundariesTab,
    ProcessAnalysisStepsTab: steps.ProcessAnalysisStepsTab,
    ProcessAnalysisBranchesTab: branches.ProcessAnalysisBranchesTab,
    ProcessAnalysisSummaryTab: summary.ProcessAnalysisSummaryTab,
    ProcessAnalysisExceptionsTab: exceptions.ProcessAnalysisExceptionsTab,
    ProcessAnalysisAiTab: ai.ProcessAnalysisAiTab,
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

async function flush(ms = 120) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

const FULL_VIEW_MODEL = {
  session_id: "s1",
  session_title: "Test Session",
  project_id: "p1",
  project_title: "Test Project",
  workspace_id: "w1",
  analysis: {
    product_actions: { rows: [], summary: {} },
    derived: {
      step_action_counts: { step_1: 1 },
      process_metrics: {
        time: { active_min: 30, wait_min: 10, lead_min: 40, mainline_min: 30, throughput_steps_per_hour: 1.5 },
        counts: { steps_total: 3, steps_bound_to_bpmn: 2, tiers: { P0: 1, P1: 1, P2: 0, None: 1 } },
        coverage: {
          bind_percent: 67,
          ai: { total: 2, done: 1, open: 1, step_coverage_percent: 33 },
          boundaries: { filled: 3, total: 5, percent: 60 },
        },
        distributions: {
          by_type: [{ key: "task", label: "Операция", count: 2, lead_min: 30, share_percent: 67 }],
          by_lane: [{ key: "cook", name: "Повар", count: 2, lead_min: 30, share_percent: 67 }],
          by_subprocess: [{ key: "prep", name: "Приготовление", count: 1, lead_min: 15, share_percent: 33 }],
        },
        top_waits: [{ step_id: "s2", seq: "2", title: "Охлаждение", wait_min: 8 }],
        extremes: {
          max_duration_step: { seq: "1", title: "Нарезка", duration_min: 20 },
          max_wait_step: { seq: "2", title: "Охлаждение", wait_min: 8 },
        },
        exceptions: { count: 1, add_min_total: 5 },
        quality: { errors_total: 0, warnings_total: 1, items: [{ kind: "warning", message: "x" }] },
        path_metrics: { steps_count: 3, work_time_total_sec: 1800, wait_time_total_sec: 600, total_time_sec: 2400 },
        source_state: { source: "process_analysis_read_model", version: "v1", computed_at: 1710000000, diagram_state_version: 7 },
      },
    },
  },
  interview_state: { status: "in_progress" },
};

function mockFetch() {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({
      suggestions: [],
      counts: { pending: 0, approved: 0, rejected: 0, total: 0 },
      readiness: { rag_readiness_status: "not_ready" },
    }),
  });
}

test("All 6 analysis tabs render without raw i18n keys", async () => {
  const {
    ProcessAnalysisDashboard,
    ProcessAnalysisBoundariesTab,
    ProcessAnalysisStepsTab,
    ProcessAnalysisBranchesTab,
    ProcessAnalysisSummaryTab,
    ProcessAnalysisExceptionsTab,
    ProcessAnalysisAiTab,
  } = await loadModules();
  const { root, cleanup, container } = setupDom();
  globalThis.fetch = mockFetch();

  try {
    await act(async () => {
      root.render(
        React.createElement(ProcessAnalysisDashboard, {
          sessionId: "s1",
          externalViewModel: FULL_VIEW_MODEL,
          tabs: [
            { key: "boundaries", label: "Границы", content: React.createElement(ProcessAnalysisBoundariesTab, { children: React.createElement("div", null, "boundaries-content") }) },
            { key: "steps", label: "Действия", content: React.createElement(ProcessAnalysisStepsTab) },
            { key: "branches", label: "Ветки", content: React.createElement(ProcessAnalysisBranchesTab) },
            { key: "summary", label: "Итоги", content: React.createElement(ProcessAnalysisSummaryTab) },
            { key: "exceptions", label: "Исключения", content: React.createElement(ProcessAnalysisExceptionsTab, { children: React.createElement("div", null, "exceptions-content") }) },
            { key: "ai", label: "AI", content: React.createElement(ProcessAnalysisAiTab, { sessionId: "s1", baseDiagramStateVersion: 7, steps: [] }) },
          ],
          defaultTabKey: "summary",
          locale: "ru",
        })
      );
    });
    await flush(200);

    const text = container.textContent;
    assert.doesNotMatch(text, /processAnalysis\./, `Rendered text contains raw i18n key: ${text.slice(0, 400)}`);
    assert.doesNotMatch(text, /analysis\./, `Rendered text contains raw i18n key: ${text.slice(0, 400)}`);

    // KPI labels from the Summary tab must be human-readable.
    ["Lead time", "Активное время", "Ожидания", "Mainline время", "Средняя длительность шага", "Привязка к BPMN", "Throughput"].forEach((label) => {
      assert.ok(text.includes(label), `Expected KPI label "${label}" in rendered output`);
    });

    // Switch to the AI tab and verify no raw i18n keys leak from the product-actions panel.
    const aiTabButton = container.querySelector('[id="process-analysis-tab-btn-ai"]');
    assert.ok(aiTabButton, "AI tab button must be rendered");
    await act(async () => {
      aiTabButton.click();
    });
    await flush(200);

    const aiText = container.textContent;
    assert.doesNotMatch(aiText, /processAnalysis\.ai\./, `AI panel rendered text contains raw i18n key: ${aiText.slice(0, 400)}`);
  } finally {
    await cleanup();
  }
});
