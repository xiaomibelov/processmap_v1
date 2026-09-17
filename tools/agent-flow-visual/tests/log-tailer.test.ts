import { describe, expect, it, vi } from "vitest";
import type { RawEvent } from "agent-flow-core";
import { LogTailer } from "../src/io/log-tailer.js";

function eventLine(event: Partial<RawEvent> & { ts: string; contour_id: string; run_id: string }): string {
  return JSON.stringify({
    event: "step.started",
    step: "plan",
    ...event,
  });
}

function makeFetch(responses: Response[]): typeof fetch {
  let i = 0;
  return vi.fn(async () => {
    const response = responses[i++] ?? new Response("", { status: 404 });
    return response;
  }) as unknown as typeof fetch;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("LogTailer", () => {
  it("emits initial events on first poll", async () => {
    const events: RawEvent[][] = [];
    const fetchImpl = makeFetch([
      new Response(`${eventLine({ ts: "2024-01-01T00:00:00Z", contour_id: "c1", run_id: "r1" })}\n`, { status: 200 }),
    ]);

    const tailer = new LogTailer({
      path: "/log.ndjson",
      intervalMs: 10,
      onEvents: (batch) => events.push(batch),
      fetchImpl,
    });

    tailer.start();
    await wait(30);
    tailer.stop();

    expect(events.length).toBe(1);
    expect(events[0].length).toBe(1);
    expect(events[0][0].contour_id).toBe("c1");
  });

  it("only emits new events on subsequent polls", async () => {
    const events: RawEvent[][] = [];
    const line1 = eventLine({ ts: "2024-01-01T00:00:00Z", contour_id: "c1", run_id: "r1" });
    const line2 = eventLine({ ts: "2024-01-01T00:00:01Z", contour_id: "c2", run_id: "r2" });

    const fetchImpl = makeFetch([
      new Response(`${line1}\n`, { status: 200 }),
      new Response(`${line1}\n${line2}\n`, { status: 200 }),
    ]);

    const tailer = new LogTailer({
      path: "/log.ndjson",
      intervalMs: 10,
      onEvents: (batch) => events.push(batch),
      fetchImpl,
    });

    tailer.start();
    await wait(60);
    tailer.stop();

    expect(events.length).toBe(2);
    expect(events[0].length).toBe(1);
    expect(events[1].length).toBe(1);
    expect(events[1][0].contour_id).toBe("c2");
  });

  it("swallows 404 without calling onError", async () => {
    const onError = vi.fn();
    const fetchImpl = makeFetch([new Response("Not found", { status: 404 })]);

    const tailer = new LogTailer({
      path: "/missing.ndjson",
      intervalMs: 10,
      onEvents: () => undefined,
      onError,
      fetchImpl,
    });

    tailer.start();
    await wait(30);
    tailer.stop();

    expect(onError).not.toHaveBeenCalled();
  });

  it("uses Range response directly when server returns 206", async () => {
    const events: RawEvent[][] = [];
    const line1 = eventLine({ ts: "2024-01-01T00:00:00Z", contour_id: "c1", run_id: "r1" });
    const line2 = eventLine({ ts: "2024-01-01T00:00:01Z", contour_id: "c2", run_id: "r2" });

    const fetchImpl = makeFetch([
      new Response(`${line1}\n`, { status: 200 }),
      new Response(`${line2}\n`, { status: 206 }),
    ]);

    const tailer = new LogTailer({
      path: "/log.ndjson",
      intervalMs: 10,
      onEvents: (batch) => events.push(batch),
      fetchImpl,
    });

    tailer.start();
    await wait(60);
    tailer.stop();

    expect(events.length).toBe(2);
    expect(events[1].length).toBe(1);
    expect(events[1][0].contour_id).toBe("c2");
  });

  it("resets offset when file shrinks and re-emits from the new file", async () => {
    const events: RawEvent[][] = [];
    const line1 = eventLine({ ts: "2024-01-01T00:00:00Z", contour_id: "c1", run_id: "r1" });
    const line2 = eventLine({ ts: "2024-01-01T00:00:01Z", contour_id: "c2", run_id: "r2" });

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      // First call returns a large file; after reset return the new small file.
      if (fetchImpl.mock.calls.length === 1) {
        return new Response(`${line1}\n${line1}\n`, { status: 200 });
      }
      return new Response(`${line2}\n`, { status: 200 });
    }) as unknown as typeof fetch;

    const tailer = new LogTailer({
      path: "/log.ndjson",
      intervalMs: 10,
      onEvents: (batch) => events.push(batch),
      fetchImpl,
    });

    tailer.start();
    await wait(80);
    tailer.stop();

    expect(events.length).toBe(2);
    expect(events[0].length).toBe(2);
    expect(events[1].length).toBe(1);
    expect(events[1][0].contour_id).toBe("c2");
  });
});
