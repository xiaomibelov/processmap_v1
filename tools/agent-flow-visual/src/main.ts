import { App } from "./app.js";
import { createFileLogLoader } from "./io/log-loader.js";

async function main() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app element not found");
  }

  const loader = createFileLogLoader("./sample-events.ndjson");
  const events = await loader.load();

  new App({ root, events, title: "feature/contour-flow-visual" });
}

main().catch((err) => {
  console.error("Failed to start Agent Flow Visual:", err);
});
