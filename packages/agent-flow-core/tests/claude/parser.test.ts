import { describe, expect, it } from "vitest";
import { parseLine, parseTranscriptLines } from "../../src/claude/parser.js";

describe("parseLine", () => {
  it("parses a user entry with string content", () => {
    const line = JSON.stringify({
      type: "user",
      uuid: "u1",
      parentUuid: "a1",
      timestamp: "2026-08-26T10:00:00.000Z",
      sessionId: "s1",
      message: { role: "user", content: "hello" },
    });
    const entry = parseLine(line);
    expect(entry).not.toBeNull();
    expect(entry?.type).toBe("user");
    if (entry?.type === "user") {
      expect(entry.message.content).toBe("hello");
    }
  });

  it("parses a user entry with array content and missing is_error", () => {
    const line = JSON.stringify({
      type: "user",
      uuid: "u1",
      timestamp: "2026-08-26T10:00:00.000Z",
      sessionId: "s1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
    });
    const entry = parseLine(line);
    expect(entry?.type).toBe("user");
    if (entry?.type === "user" && typeof entry.message.content !== "string") {
      const tr = entry.message.content[0];
      expect(tr.type).toBe("tool_result");
      expect(tr.tool_use_id).toBe("t1");
      expect(tr.is_error).toBeUndefined();
    }
  });

  it("parses an assistant entry with text/thinking/tool_use", () => {
    const line = JSON.stringify({
      type: "assistant",
      uuid: "a1",
      parentUuid: null,
      timestamp: "2026-08-26T10:00:00.000Z",
      sessionId: "s1",
      message: {
        role: "assistant",
        model: "claude-opus-4-8",
        content: [
          { type: "text", text: "hi" },
          { type: "thinking", thinking: "..." },
          { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
        ],
      },
    });
    const entry = parseLine(line);
    expect(entry?.type).toBe("assistant");
    if (entry?.type === "assistant") {
      expect(entry.message.model).toBe("claude-opus-4-8");
      expect(entry.message.content).toHaveLength(3);
      expect(entry.message.content[2].type).toBe("tool_use");
    }
  });

  it("parses flat metadata entries", () => {
    const lines = [
      JSON.stringify({ type: "ai-title", title: "T" }),
      JSON.stringify({ type: "mode", mode: "code" }),
      JSON.stringify({ type: "permission-mode", permissionMode: "yolo" }),
      JSON.stringify({ type: "last-prompt", prompt: "do it" }),
      JSON.stringify({ type: "queue-operation", op: "enqueue", count: 3 }),
      JSON.stringify({ type: "file-history-snapshot", snapshots: { a: 1, b: 2 } }),
    ];
    const entries = parseTranscriptLines(lines);
    expect(entries.map((e) => e.type)).toEqual([
      "ai-title",
      "mode",
      "permission-mode",
      "last-prompt",
      "queue-operation",
      "file-history-snapshot",
    ]);
    const snap = entries[5];
    expect(snap.type).toBe("file-history-snapshot");
  });

  it("parses ledger entries", () => {
    const started = parseLine(JSON.stringify({ type: "started", key: "k", agentId: "a1" }));
    const result = parseLine(JSON.stringify({ type: "result", key: "k", agentId: "a1", result: "success" }));
    expect(started?.type).toBe("started");
    expect(result?.type).toBe("result");
  });

  it("returns Unknown for unrecognized type", () => {
    const entry = parseLine(JSON.stringify({ type: "unicorn" }));
    expect(entry?.type).toBe("Unknown");
  });

  it("returns Unknown for malformed JSON", () => {
    expect(parseLine("{broken")?.type).toBe("Unknown");
  });

  it("returns null for blank lines", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("   ")).toBeNull();
  });
});

describe("parseTranscriptLines", () => {
  it("keeps Unknown entries and skips blanks", () => {
    const lines = [
      JSON.stringify({ type: "ai-title", title: "T" }),
      "",
      "{bad",
      JSON.stringify({ type: "mode", mode: "x" }),
    ];
    const entries = parseTranscriptLines(lines);
    expect(entries).toHaveLength(3);
    expect(entries[0].type).toBe("ai-title");
    expect(entries[1].type).toBe("Unknown");
    expect(entries[2].type).toBe("mode");
  });
});
