import { App } from "./app.js";
import { createStaticLogLoader } from "./io/log-loader.js";

const SAMPLE_LOG = [
  JSON.stringify({
    ts: "2026-08-26T13:00:00.000Z",
    event: "contour.started",
    contour_id: "feature/contour-flow-visual",
    run_id: "a1".repeat(16),
    type: "feature",
    name: "contour-flow-visual",
    branch: "feature/contour-flow-visual",
  }),
  JSON.stringify({
    ts: "2026-08-26T13:00:01.000Z",
    event: "step.started",
    contour_id: "feature/contour-flow-visual",
    run_id: "a1".repeat(16),
    step: "rag_preflight",
  }),
  JSON.stringify({
    ts: "2026-08-26T13:00:02.000Z",
    event: "step.finished",
    contour_id: "feature/contour-flow-visual",
    run_id: "a1".repeat(16),
    step: "rag_preflight",
    result: "ok",
  }),
  JSON.stringify({
    ts: "2026-08-26T13:00:03.000Z",
    event: "step.started",
    contour_id: "feature/contour-flow-visual",
    run_id: "a1".repeat(16),
    step: "plan",
  }),
  JSON.stringify({
    ts: "2026-08-26T13:00:04.000Z",
    event: "artifact.written",
    contour_id: "feature/contour-flow-visual",
    run_id: "a1".repeat(16),
    kind: "PLAN",
    path: ".planning/contours/feature/contour-flow-visual/PLAN.md",
    step: "plan",
  }),
  JSON.stringify({
    ts: "2026-08-26T13:00:05.000Z",
    event: "step.finished",
    contour_id: "feature/contour-flow-visual",
    run_id: "a1".repeat(16),
    step: "plan",
    result: "ok",
  }),
  JSON.stringify({
    ts: "2026-08-26T13:00:06.000Z",
    event: "step.started",
    contour_id: "feature/contour-flow-visual",
    run_id: "a1".repeat(16),
    step: "api",
  }),
].join("\n");

async function main() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app element not found");
  }

  const loader = createStaticLogLoader(SAMPLE_LOG);
  const events = await loader.load();

  new App({ root, events });
}

main().catch((err) => {
  console.error("Failed to start Agent Flow Visual:", err);
});
