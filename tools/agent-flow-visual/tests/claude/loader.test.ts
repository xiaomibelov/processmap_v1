import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReplay, discoverSessions, loadSession } from "../../src/claude/loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../fixtures");

describe("discoverSessions", () => {
  it("finds UUID-named JSONL sessions in a project dir", async () => {
    const sessions = await discoverSessions(FIXTURES);
    const ids = sessions.map((s) => s.sessionId);
    expect(ids).toContain("simple-session");
    expect(ids).toContain("workflow-session");
  });
});

describe("buildReplay", () => {
  it("loads a simple session with main + subagent", async () => {
    const pkg = await buildReplay(path.join(FIXTURES, "simple-session.jsonl"));
    expect(pkg.sessionId).toBe("simple-session");
    expect(pkg.info.title).toBe("Simple test session");
    const model = pkg.items.map((i) => i.update);
    expect(model.length).toBeGreaterThan(0);
  });

  it("loads a workflow session with group and subagent", async () => {
    const pkg = await buildReplay(path.join(FIXTURES, "workflow-session.jsonl"));
    expect(pkg.sessionId).toBe("workflow-session");
    const ids = pkg.items.map((i) => (i.update.type === "Entry" ? i.update.entry.type : "meta"));
    expect(ids).toContain("result");
  });
});

describe("loadSession", () => {
  it("loads the latest session from a directory", async () => {
    const pkg = await loadSession(FIXTURES);
    expect(pkg.sessionId).toBeTruthy();
    expect(pkg.items.length).toBeGreaterThan(0);
  });
});
