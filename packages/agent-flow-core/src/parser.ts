import type { RawEvent } from "./types.js";

const KNOWN_EVENT_TYPES = new Set([
  "contour.started",
  "step.started",
  "step.finished",
  "tool.started",
  "tool.finished",
  "tokens.used",
  "artifact.written",
  "mirror.done",
  "approval.required",
  "approval.granted",
  "contour.finished",
]);

const REQUIRED_FIELDS = ["ts", "event", "contour_id", "run_id"] as const;

/**
 * Parse a single NDJSON line into a RawEvent.
 * Returns null for blank lines, invalid JSON, missing required fields,
 * unknown event versions, or unknown event types.
 */
export function parseEventLine(line: string): RawEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (typeof record[field] !== "string" || !record[field]) return null;
  }

  // Version check: default to 1, reject unknown major versions.
  const version = typeof record.v === "number" ? record.v : 1;
  if (version !== 1) return null;

  const event = record.event as string;
  if (!KNOWN_EVENT_TYPES.has(event)) return null;

  return record as RawEvent;
}

/**
 * Parse a full NDJSON text into an array of RawEvents.
 * Invalid/unknown lines are silently skipped.
 */
export function parseEventLog(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const event = parseEventLine(line);
    if (event) events.push(event);
  }
  return events;
}

/**
 * Returns true if the event type is recognized by the parser.
 */
export function isKnownEventType(eventType: string): boolean {
  return KNOWN_EVENT_TYPES.has(eventType);
}
