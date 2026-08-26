import { App } from "./app.js";
import { createFileLogLoader } from "./io/log-loader.js";
import { createScannerClient } from "./io/scanner.js";
import type { RawEvent, ContourModel } from "agent-flow-core";

function resolveLogPath(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("log");
  if (fromUrl) return fromUrl;

  const fromEnv = import.meta.env.AGENT_EVENTS_LOG;
  if (fromEnv) return fromEnv;

  return ".agents/events/agent-events.ndjson";
}

async function loadDemoEvents(): Promise<RawEvent[]> {
  const scanner = createScannerClient();
  return scanner.loadDemoEvents();
}

async function loadSnapshot(): Promise<ContourModel[]> {
  const scanner = createScannerClient();
  return scanner.loadContours();
}

async function main() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app element not found");
  }

  const params = new URLSearchParams(window.location.search);
  const demoRequested = params.get("demo") === "1";

  if (demoRequested) {
    const events = await loadDemoEvents();
    new App({
      root,
      events,
      mode: "demo",
      title: "feature/contour-flow-visual (demo)",
    });
    return;
  }

  const logPath = resolveLogPath();
  let events: RawEvent[] = [];
  let hasEvents = false;

  try {
    events = await createFileLogLoader(logPath).load();
    hasEvents = events.length > 0;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.info("Event log not available; switching to snapshot mode.", err);
  }

  if (hasEvents) {
    new App({
      root,
      events,
      mode: events.length > 0 ? "replay" : "live",
      title: "feature/contour-flow-visual",
      tailPath: logPath,
    });
    return;
  }

  const contours = await loadSnapshot();
  new App({
    root,
    events: [],
    initialContours: contours,
    mode: "snapshot",
    title: "ProcessMap contours",
  });
}

main().catch((err) => {
  console.error("Failed to start Agent Flow Visual:", err);
});
