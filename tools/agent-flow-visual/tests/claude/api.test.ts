import { describe, expect, it } from "vitest";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeApiMiddleware } from "../../src/server/api.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../fixtures");

function request(
  middleware: ReturnType<typeof claudeApiMiddleware>,
  method: string,
  url: string,
  body?: string
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void middleware(req, res, () => {
        res.statusCode = 404;
        res.end("not found");
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as import("node:net").AddressInfo).port;
      const req = http.request(
        { method, hostname: "127.0.0.1", port, path: url },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            let parsed: unknown = data;
            try {
              parsed = JSON.parse(data);
            } catch {
              // leave as string
            }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        }
      );
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  });
}

describe("claude API middleware", () => {
  it("discovers sessions", async () => {
    const mw = claudeApiMiddleware();
    const { status, body } = await request(
      mw,
      "POST",
      "/api/claude/discover",
      JSON.stringify({ projectDir: FIXTURES })
    );
    expect(status).toBe(200);
    const sessions = (body as { sessions: Array<{ sessionId: string }> }).sessions;
    expect(sessions.some((s) => s.sessionId === "simple-session")).toBe(true);
  });

  it("returns a session snapshot", async () => {
    const mw = claudeApiMiddleware();
    const { status, body } = await request(
      mw,
      "GET",
      `/api/claude/session?path=${encodeURIComponent(path.join(FIXTURES, "simple-session.jsonl"))}`
    );
    expect(status).toBe(200);
    const pkg = body as { sessionId: string; info: { title: string }; items: unknown[] };
    expect(pkg.sessionId).toBe("simple-session");
    expect(pkg.info.title).toBe("Simple test session");
    expect(pkg.items.length).toBeGreaterThan(0);
  });

  it("tails appended bytes", async () => {
    const mw = claudeApiMiddleware();
    const filePath = path.join(FIXTURES, "simple-session.jsonl");
    const { status, body } = await request(mw, "GET", `/api/claude/tail?path=${encodeURIComponent(filePath)}&offset=0`);
    expect(status).toBe(200);
    const tail = body as { offset: number; updates: unknown[] };
    expect(tail.updates.length).toBeGreaterThan(0);
    expect(tail.offset).toBeGreaterThan(0);
  });

  it("rejects path traversal", async () => {
    const mw = claudeApiMiddleware();
    const { status } = await request(
      mw,
      "GET",
      `/api/claude/session?path=${encodeURIComponent("/etc/passwd")}`
    );
    expect(status).toBe(403);
  });
});
