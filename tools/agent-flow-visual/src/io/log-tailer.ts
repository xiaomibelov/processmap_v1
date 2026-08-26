import { parseEventLine, type RawEvent } from "agent-flow-core";

export interface LogTailerOptions {
  /** Path to the NDJSON log file. */
  path: string;
  /** Polling interval in milliseconds. */
  intervalMs?: number;
  /** Called with newly parsed events. */
  onEvents: (events: RawEvent[]) => void;
  /** Called on unexpected errors (404s are swallowed and retried). */
  onError?: (error: Error) => void;
  /** Inject a fetch implementation for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Polls a local NDJSON log file and emits only new events since the last poll.
 *
 * The tailer tries to use HTTP Range requests to avoid transferring the whole
 * file, but falls back to fetching the full file and slicing from the last
 * known byte offset when the dev server does not honor ranges.
 */
export class LogTailer {
  private readonly path: string;
  private readonly intervalMs: number;
  private readonly onEvents: (events: RawEvent[]) => void;
  private readonly onError?: (error: Error) => void;
  private readonly fetchImpl: typeof fetch;
  private lastByteOffset = 0;
  private lastLineCount = 0;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LogTailerOptions) {
    this.path = options.path;
    this.intervalMs = options.intervalMs ?? 750;
    this.onEvents = options.onEvents;
    this.onError = options.onError;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get byteOffset(): number {
    return this.lastByteOffset;
  }

  get lineCount(): number {
    return this.lastLineCount;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const url = `${this.path}?_=${Date.now()}`;
    try {
      const response = await this.fetchImpl(url, {
        headers:
          this.lastByteOffset > 0
            ? { Range: `bytes=${this.lastByteOffset}-` }
            : undefined,
      });

      if (response.status === 404) {
        // File does not exist yet; keep retrying.
        return;
      }

      if (response.status === 416) {
        // Range not satisfiable — file shrank or our offset is stale. Reset.
        this.lastByteOffset = 0;
        this.lastLineCount = 0;
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch log: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const isPartial = response.status === 206;
      const newText = isPartial ? text : text.slice(this.lastByteOffset);

      // If the full file is smaller than our remembered offset, it was truncated.
      if (!isPartial && text.length < this.lastByteOffset) {
        this.lastByteOffset = 0;
        this.lastLineCount = 0;
        return this.tick();
      }

      const events = parseNewLines(newText);
      const nonBlankNewLines = countNonBlankLines(newText);

      if (isPartial) {
        this.lastByteOffset += byteLength(text);
      } else {
        this.lastByteOffset = byteLength(text);
      }
      this.lastLineCount += nonBlankNewLines;

      if (events.length > 0) {
        this.onEvents(events);
      }
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function countNonBlankLines(text: string): number {
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) count++;
  }
  return count;
}

function parseNewLines(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const event = parseEventLine(line);
    if (event) events.push(event);
  }
  return events;
}
