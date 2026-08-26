import { describe, expect, it } from "vitest";
import {
  createSessionModel,
  foldUpdate,
  rebuild,
  type Update,
} from "../../src/claude/session-model.js";

function entry(source: Update["source"], entryType: string, overrides: Record<string, unknown> = {}): Update {
  return {
    type: "Entry",
    source,
    entry: { type: entryType, ...overrides } as import("../../src/claude/transcript.js").Entry,
  };
}

function assistant(source: Update["source"], ts: string, content: unknown[], requestId?: string): Update {
  return {
    type: "Entry",
    source,
    entry: {
      type: "assistant",
      timestamp: ts,
      sessionId: "s1",
      requestId,
      message: { role: "assistant", content },
    } as import("../../src/claude/transcript.js").Entry,
  };
}

function user(source: Update["source"], ts: string, content: unknown): Update {
  return {
    type: "Entry",
    source,
    entry: {
      type: "user",
      timestamp: ts,
      sessionId: "s1",
      message: { role: "user", content },
    } as import("../../src/claude/transcript.js").Entry,
  };
}

function meta(meta: import("../../src/claude/session-model.js").SubagentMeta): Update {
  return { type: "SubagentMeta", source: { type: "Meta" }, meta };
}

describe("SessionModel", () => {
  it("creates main agent from root entry", () => {
    const model = createSessionModel("s1");
    foldUpdate(
      model,
      assistant({ type: "Main" }, "2026-08-26T10:00:00.000Z", [{ type: "text", text: "hi" }])
    );
    expect(model.agents.has("main")).toBe(true);
    expect(model.agents.get("main")!.kind).toBe("main");
  });

  it("spawns a subagent on Agent tool_use and completes via ack when no own activity", () => {
    const updates: Update[] = [
      assistant({ type: "Main" }, "2026-08-26T10:00:00.000Z", [
        { type: "tool_use", id: "tu-agent", name: "Agent", input: { description: "D" } },
      ]),
      user({ type: "Main" }, "2026-08-26T10:00:01.000Z", [
        { type: "tool_result", tool_use_id: "tu-agent", content: "ok" },
      ]),
    ];
    const model = rebuild(updates, new Date("2026-08-26T10:00:02.000Z"));
    expect(model.agents.get("tu-agent")?.status).toBe("done");
    expect(model.agents.get("tu-agent")?.terminal).toBe(true);
  });

  it("keeps subagent running when it has later own activity", () => {
    const updates: Update[] = [
      assistant({ type: "Main" }, "2026-08-26T10:00:00.000Z", [
        { type: "tool_use", id: "tu-agent", name: "Agent", input: { description: "D" } },
      ]),
      user({ type: "Main" }, "2026-08-26T10:00:01.000Z", [
        { type: "tool_result", tool_use_id: "tu-agent", content: "ok" },
      ]),
      meta({ agentId: "sub1", agentType: "guide", toolUseId: "tu-agent" }),
      assistant({ type: "Subagent", agentId: "sub1" }, "2026-08-26T10:00:05.000Z", [
        { type: "text", text: "working" },
      ]),
    ];
    const model = rebuild(updates, new Date("2026-08-26T10:00:06.000Z"));
    expect(model.agents.get("sub1")?.status).toBe("running");
  });

  it("marks subagent failed on Agent tool_result with is_error", () => {
    const updates: Update[] = [
      assistant({ type: "Main" }, "2026-08-26T10:00:00.000Z", [
        { type: "tool_use", id: "tu-agent", name: "Agent", input: {} },
      ]),
      user({ type: "Main" }, "2026-08-26T10:00:01.000Z", [
        { type: "tool_result", tool_use_id: "tu-agent", content: "err", is_error: true },
      ]),
    ];
    const model = rebuild(updates, new Date("2026-08-26T10:00:02.000Z"));
    expect(model.agents.get("tu-agent")?.status).toBe("failed");
  });

  it("handles task-notification terminal report", () => {
    const updates: Update[] = [
      meta({ agentId: "sub1", agentType: "guide", toolUseId: "tu-agent" }),
      assistant({ type: "Subagent", agentId: "sub1" }, "2026-08-26T10:00:00.000Z", [
        { type: "text", text: "x" },
      ]),
      entry({ type: "Main" }, "system", {
        subtype: "task-notification",
        agentId: "sub1",
        result: "stopped",
        timestamp: "2026-08-26T10:00:10.000Z",
      }),
    ];
    const model = rebuild(updates, new Date("2026-08-26T10:00:11.000Z"));
    expect(model.agents.get("sub1")?.status).toBe("stopped");
    expect(model.agents.get("sub1")?.terminal).toBe(true);
  });

  it("completes workflow subagent from journal result", () => {
    const updates: Update[] = [
      meta({ agentId: "wfsub", agentType: "workflow-subagent", workflowId: "wf-1" }),
      assistant({ type: "Subagent", agentId: "wfsub" }, "2026-08-26T11:00:00.000Z", [
        { type: "text", text: "x" },
      ]),
      entry({ type: "Journal", workflowId: "wf-1" }, "result", { agentId: "wfsub", result: "success" }),
    ];
    const model = rebuild(updates, new Date("2026-08-26T11:00:01.000Z"));
    expect(model.agents.get("wfsub")?.status).toBe("done");
    expect(model.agents.get("wf-1")?.status).toBe("done");
  });

  it("rolls up workflow group as failed if any child failed", () => {
    const updates: Update[] = [
      meta({ agentId: "wfsub", agentType: "workflow-subagent", workflowId: "wf-1" }),
      entry({ type: "Journal", workflowId: "wf-1" }, "result", { agentId: "wfsub", result: "failed" }),
    ];
    const model = rebuild(updates, new Date("2026-08-26T11:00:01.000Z"));
    expect(model.agents.get("wf-1")?.status).toBe("failed");
  });

  it("keeps agent running while a tool call is pending", () => {
    const updates: Update[] = [
      assistant({ type: "Main" }, "2026-08-26T10:00:00.000Z", [
        { type: "tool_use", id: "tu-bash", name: "Bash", input: { command: "sleep 5" } },
      ]),
    ];
    const model = rebuild(updates, new Date("2026-08-26T10:05:00.000Z"));
    expect(model.agents.get("main")?.status).toBe("running");
    expect(model.agents.get("main")?.toolCalls[0].status).toBe("pending");
  });

  it("dedups output tokens by requestId", () => {
    const updates: Update[] = [
      assistant({ type: "Main" }, "2026-08-26T10:00:00.000Z", [], "req-1"),
      assistant({ type: "Main" }, "2026-08-26T10:00:01.000Z", [], "req-1"),
    ];
    // Give the entries usage so tokens can be counted.
    (updates[0] as any).entry.message.usage = { output_tokens: 100 };
    (updates[1] as any).entry.message.usage = { output_tokens: 100 };
    const model = rebuild(updates);
    expect(model.agents.get("main")?.outputTokens).toBe(100);
  });

  it("is order-independent for the same fact set", () => {
    const updates: Update[] = [
      meta({ agentId: "sub1", agentType: "guide", toolUseId: "tu-agent" }),
      assistant({ type: "Main" }, "2026-08-26T10:00:00.000Z", [
        { type: "tool_use", id: "tu-agent", name: "Agent", input: {} },
      ]),
      user({ type: "Main" }, "2026-08-26T10:00:01.000Z", [
        { type: "tool_result", tool_use_id: "tu-agent", content: "ok" },
      ]),
      assistant({ type: "Subagent", agentId: "sub1" }, "2026-08-26T10:00:05.000Z", [
        { type: "text", text: "done" },
      ]),
    ];

    function normalize(model: ReturnType<typeof rebuild>) {
      return [...model.agents.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, a]) => ({
          id,
          status: a.status,
          terminal: a.terminal,
          tools: a.toolCalls.map((t) => ({ id: t.id, status: t.status })),
          tokens: a.outputTokens,
        }));
    }

    const ordered = normalize(rebuild(updates, new Date("2026-08-26T10:00:06.000Z")));
    for (let i = 0; i < 20; i++) {
      const shuffled = [...updates];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      expect(normalize(rebuild(shuffled, new Date("2026-08-26T10:00:06.000Z")))).toEqual(ordered);
    }
  });
});
