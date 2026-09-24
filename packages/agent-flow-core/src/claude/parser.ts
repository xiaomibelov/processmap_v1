import type {
  AiTitleEntry,
  AssistantContentBlock,
  Entry,
  FileHistorySnapshotEntry,
  LastPromptEntry,
  ModeEntry,
  PermissionModeEntry,
  QueueOperationEntry,
  ResultEntry,
  StartedEntry,
  TextBlock,
  ToolResultBlock,
  ToolResultContentBlock,
  ToolUseBlock,
  UnknownEntry,
  UserContentBlock,
} from "./transcript.js";

export type ParsedEntry = Entry;

const UNKNOWN: UnknownEntry = { type: "Unknown" };

/**
 * Parse a single JSONL line defensively.
 * Blank lines return null. Malformed JSON or unrecognized shapes become
 * `{ type: "Unknown" }`.
 */
export function parseLine(line: string): ParsedEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return UNKNOWN;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return UNKNOWN;
  }

  const record = parsed as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : undefined;

  switch (type) {
    case "user":
      return parseUser(record);
    case "assistant":
      return parseAssistant(record);
    case "system":
      return parseSystem(record);
    case "attachment":
      return parseAttachment(record);
    case "ai-title":
      return parseAiTitle(record);
    case "mode":
      return parseMode(record);
    case "permission-mode":
      return parsePermissionMode(record);
    case "last-prompt":
      return parseLastPrompt(record);
    case "queue-operation":
      return parseQueueOperation(record);
    case "file-history-snapshot":
      return parseFileHistorySnapshot(record);
    case "started":
      return parseStarted(record);
    case "result":
      return parseResult(record);
    default:
      return UNKNOWN;
  }
}

/**
 * Parse many JSONL lines. Unknown/malformed lines are kept as `Unknown` so the
 * caller can decide how to surface them; blank lines are dropped.
 */
export function parseTranscriptLines(lines: string[]): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

function parseEnvelope(record: Record<string, unknown>) {
  return {
    uuid: optString(record.uuid),
    parentUuid: record.parentUuid === null ? null : optString(record.parentUuid),
    timestamp: optString(record.timestamp),
    sessionId: optString(record.sessionId),
    promptId: optString(record.promptId),
    requestId: optString(record.requestId),
    agentId: optString(record.agentId),
    isSidechain: typeof record.isSidechain === "boolean" ? record.isSidechain : undefined,
  };
}

function optString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseUser(record: Record<string, unknown>): ParsedEntry {
  const message = parseUserMessage(record.message);
  if (!message) return UNKNOWN;
  return {
    ...parseEnvelope(record),
    type: "user",
    message,
    toolUseResult: record.toolUseResult,
  };
}

function parseUserMessage(value: unknown):
  | { role: "user"; content: string | UserContentBlock[] }
  | null {
  if (typeof value === "string") {
    return { role: "user", content: value };
  }
  if (!value || typeof value !== "object") return null;
  const msg = value as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") {
    return { role: "user", content };
  }
  if (Array.isArray(content)) {
    return { role: "user", content: content.map(parseUserContentBlock) };
  }
  return { role: "user", content: "" };
}

function parseUserContentBlock(value: unknown): UserContentBlock {
  if (!value || typeof value !== "object") return { type: "text", text: "" };
  const block = value as Record<string, unknown>;
  if (block.type === "tool_result") {
    const content = block.content;
    let parsedContent: string | ToolResultContentBlock[] = "";
    if (typeof content === "string") {
      parsedContent = content;
    } else if (Array.isArray(content)) {
      parsedContent = content.map(parseToolResultContentBlock);
    }
    return {
      type: "tool_result",
      tool_use_id: typeof block.tool_use_id === "string" ? block.tool_use_id : "",
      content: parsedContent,
      is_error:
        typeof block.is_error === "boolean" ? block.is_error : undefined,
    };
  }
  return { type: "text", text: typeof block.text === "string" ? block.text : "" };
}

function parseToolResultContentBlock(value: unknown): ToolResultContentBlock {
  if (!value || typeof value !== "object") return { type: "text", text: "" };
  const block = value as Record<string, unknown>;
  if (block.type === "tool_result") {
    return parseUserContentBlock(value) as ToolResultBlock;
  }
  return { type: "text", text: typeof block.text === "string" ? block.text : "" };
}

function parseAssistant(record: Record<string, unknown>): ParsedEntry {
  const message = parseAssistantMessage(record.message);
  if (!message) return UNKNOWN;
  return {
    ...parseEnvelope(record),
    type: "assistant",
    message,
  };
}

function parseAssistantMessage(
  value: unknown
): { role: "assistant"; model?: string; content: AssistantContentBlock[]; stop_reason?: string; usage?: { output_tokens?: number } } | null {
  if (!value || typeof value !== "object") return null;
  const msg = value as Record<string, unknown>;
  const content = Array.isArray(msg.content)
    ? msg.content.map(parseAssistantContentBlock)
    : [];
  const usage = parseUsage(msg.usage);
  return {
    role: "assistant",
    model: typeof msg.model === "string" ? msg.model : undefined,
    content,
    stop_reason: typeof msg.stop_reason === "string" ? msg.stop_reason : undefined,
    usage,
  };
}

function parseUsage(value: unknown): { output_tokens?: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const u = value as Record<string, unknown>;
  const out = typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  return out !== undefined ? { output_tokens: out } : undefined;
}

function parseAssistantContentBlock(value: unknown): AssistantContentBlock {
  if (!value || typeof value !== "object") return { type: "text", text: "" };
  const block = value as Record<string, unknown>;
  switch (block.type) {
    case "thinking":
      return {
        type: "thinking",
        thinking: typeof block.thinking === "string" ? block.thinking : "",
        signature: typeof block.signature === "string" ? block.signature : undefined,
      };
    case "tool_use":
      return {
        type: "tool_use",
        id: typeof block.id === "string" ? block.id : "",
        name: typeof block.name === "string" ? block.name : "",
        input: block.input,
        caller: typeof block.caller === "string" ? block.caller : undefined,
      };
    case "text":
    default:
      return { type: "text", text: typeof block.text === "string" ? block.text : "" };
  }
}

function parseSystem(record: Record<string, unknown>): ParsedEntry {
  return {
    ...parseEnvelope(record),
    type: "system",
    subtype: typeof record.subtype === "string" ? record.subtype : "unknown",
  };
}

function parseAttachment(record: Record<string, unknown>): ParsedEntry {
  const attachment =
    record.attachment && typeof record.attachment === "object"
      ? (record.attachment as Record<string, unknown>)
      : { type: "unknown" };
  return {
    ...parseEnvelope(record),
    type: "attachment",
    attachment: { type: typeof attachment.type === "string" ? attachment.type : "unknown" },
  };
}

function parseAiTitle(record: Record<string, unknown>): AiTitleEntry {
  return { type: "ai-title", title: typeof record.title === "string" ? record.title : "" };
}

function parseMode(record: Record<string, unknown>): ModeEntry {
  return { type: "mode", mode: typeof record.mode === "string" ? record.mode : "" };
}

function parsePermissionMode(record: Record<string, unknown>): PermissionModeEntry {
  return {
    type: "permission-mode",
    permissionMode: typeof record.permissionMode === "string" ? record.permissionMode : "",
  };
}

function parseLastPrompt(record: Record<string, unknown>): LastPromptEntry {
  return {
    type: "last-prompt",
    prompt: typeof record.prompt === "string" ? record.prompt : "",
  };
}

function parseQueueOperation(record: Record<string, unknown>): QueueOperationEntry {
  return {
    type: "queue-operation",
    op: typeof record.op === "string" ? record.op : "",
    count: typeof record.count === "number" ? record.count : undefined,
  };
}

function parseFileHistorySnapshot(record: Record<string, unknown>): FileHistorySnapshotEntry {
  let snapshots: Record<string, unknown> | unknown[] = {};
  if (record.snapshots && typeof record.snapshots === "object") {
    snapshots = Array.isArray(record.snapshots)
      ? record.snapshots
      : (record.snapshots as Record<string, unknown>);
  }
  return { type: "file-history-snapshot", snapshots };
}

function parseStarted(record: Record<string, unknown>): StartedEntry {
  return {
    ...parseEnvelope(record),
    type: "started",
    key: typeof record.key === "string" ? record.key : "",
    agentId: typeof record.agentId === "string" ? record.agentId : "",
  };
}

function parseResult(record: Record<string, unknown>): ResultEntry {
  return {
    ...parseEnvelope(record),
    type: "result",
    key: typeof record.key === "string" ? record.key : "",
    agentId: typeof record.agentId === "string" ? record.agentId : "",
    result: typeof record.result === "string" ? record.result : "",
  };
}

export function toolUseBlocks(entry: Entry): ToolUseBlock[] {
  if (entry.type !== "assistant") return [];
  return entry.message.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

export function toolResultBlocks(entry: Entry): ToolResultBlock[] {
  if (entry.type !== "user") return [];
  const content = entry.message.content;
  if (typeof content === "string") return [];
  return content.filter((b): b is ToolResultBlock => b.type === "tool_result");
}

export function textBlocks(entry: Entry): TextBlock[] {
  if (entry.type === "assistant") {
    return entry.message.content.filter((b): b is TextBlock => b.type === "text");
  }
  if (entry.type === "user") {
    const content = entry.message.content;
    if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
    return content.filter((b): b is TextBlock => b.type === "text");
  }
  return [];
}
