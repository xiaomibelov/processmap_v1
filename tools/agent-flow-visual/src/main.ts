import { App } from "./app.js";
import { createFileLogLoader } from "./io/log-loader.js";

function resolveLogPath(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("log");
  if (fromUrl) return fromUrl;

  // Vite exposes env vars prefixed with AGENT_ to the client.
  const fromEnv = import.meta.env.AGENT_EVENTS_LOG;
  if (fromEnv) return fromEnv;

  return ".agents/events/agent-events.ndjson";
}

async function main() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app element not found");
  }

  const logPath = resolveLogPath();
  const loader = createFileLogLoader(logPath);

  let events: import("agent-flow-core").RawEvent[] = [];
  let mode: "live" | "replay" = "live";

  try {
    events = await loader.load();
    mode = events.length > 0 ? "replay" : "live";
  } catch (err) {
    // File does not exist yet — start live and wait for events.
    mode = "live";
    events = [];
    // eslint-disable-next-line no-console
    console.info("Log file not found; starting in live mode.", err);
  }

  new App({ root, events, title: "feature/contour-flow-visual", mode, tailPath: logPath });
}

main().catch((err) => {
  console.error("Failed to start Agent Flow Visual:", err);
});
