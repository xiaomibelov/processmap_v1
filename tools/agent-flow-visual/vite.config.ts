import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs";
import { claudeApiMiddleware } from "./src/server/api.ts";

const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * Dev-only middleware: serve repo-root `.agents/` under `/.agents/` so the
 * append-only event log written by `tools/log-agent-event.mjs` is reachable
 * from the dev page without leaving the project tree.
 */
function agentsEventLogMiddleware() {
  const prefix = "/.agents/";
  const baseDir = path.join(REPO_ROOT, ".agents");
  return async (req, res, next) => {
    if (!req.url?.startsWith(prefix)) return next();
    // Strip query string before resolving the file path.
    const urlPath = req.url.split("?")[0];
    const relative = decodeURIComponent(urlPath.slice(prefix.length));
    const filePath = path.join(baseDir, relative);
    // Safety: prevent escaping .agents directory.
    if (!filePath.startsWith(baseDir)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  };
}

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "agent-flow-core": path.resolve(__dirname, "../../packages/agent-flow-core/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5717,
    middlewareMode: false,
  },
  envPrefix: "AGENT_",
  plugins: [
    {
      name: "agents-event-log",
      configureServer(server) {
        // Prepend before Vite's own static middleware so repo-root .agents/
        // is served even though it lives outside the dev-server root.
        server.middlewares.stack.unshift({
          route: "",
          handle: agentsEventLogMiddleware(),
        });
      },
    },
    {
      name: "claude-api",
      configureServer(server) {
        server.middlewares.stack.unshift({
          route: "",
          handle: claudeApiMiddleware(),
        });
      },
    },
  ],
});
