/**
 * Serde model for Claude Code JSONL transcript entries.
 *
 * Based on the zoetrope DESIGN.md spec (Claude Code JSONL is undocumented and
 * subject to change, so every field is treated as optional / defensive).
 */

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ToolResultContentBlock[];
  is_error?: boolean;
}

export type ToolResultContentBlock = TextBlock | ToolResultBlock;

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
  caller?: string;
}

export type UserContentBlock = TextBlock | ToolResultBlock;
export type AssistantContentBlock = TextBlock | ThinkingBlock | ToolUseBlock;

// ---------------------------------------------------------------------------
// Usage / message envelopes
// ---------------------------------------------------------------------------

export interface Usage {
  output_tokens?: number;
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface UserMessage {
  role: "user";
  content: string | UserContentBlock[];
}

export interface AssistantMessage {
  role: "assistant";
  model?: string;
  content: AssistantContentBlock[];
  stop_reason?: string;
  usage?: Usage;
}

// ---------------------------------------------------------------------------
// Typed transcript entries (with envelope)
// ---------------------------------------------------------------------------

export interface EnvelopeFields {
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  sessionId?: string;
  promptId?: string;
  requestId?: string;
  agentId?: string;
  isSidechain?: boolean;
}

export interface UserEntry extends EnvelopeFields {
  type: "user";
  message: UserMessage;
  toolUseResult?: unknown;
}

export interface AssistantEntry extends EnvelopeFields {
  type: "assistant";
  message: AssistantMessage;
}

export interface SystemEntry extends EnvelopeFields {
  type: "system";
  subtype: string;
  [key: string]: unknown;
}

export interface AttachmentEntry extends EnvelopeFields {
  type: "attachment";
  attachment: { type: string; [key: string]: unknown };
}

// ---------------------------------------------------------------------------
// Flat metadata entries (no envelope)
// ---------------------------------------------------------------------------

export interface AiTitleEntry {
  type: "ai-title";
  title: string;
}

export interface ModeEntry {
  type: "mode";
  mode: string;
}

export interface PermissionModeEntry {
  type: "permission-mode";
  permissionMode: string;
}

export interface LastPromptEntry {
  type: "last-prompt";
  prompt: string;
}

export interface QueueOperationEntry {
  type: "queue-operation";
  op: string;
  count?: number;
}

export interface FileHistorySnapshotEntry {
  type: "file-history-snapshot";
  snapshots: Record<string, unknown> | unknown[];
}

// ---------------------------------------------------------------------------
// Ledger entries
// ---------------------------------------------------------------------------

export interface StartedEntry extends EnvelopeFields {
  type: "started";
  key: string;
  agentId: string;
}

export interface ResultEntry extends EnvelopeFields {
  type: "result";
  key: string;
  agentId: string;
  result: string;
}

// ---------------------------------------------------------------------------
// Unknown fallback
// ---------------------------------------------------------------------------

export interface UnknownEntry {
  type: "Unknown";
}

// ---------------------------------------------------------------------------
// Entry union
// ---------------------------------------------------------------------------

export type Entry =
  | UserEntry
  | AssistantEntry
  | SystemEntry
  | AttachmentEntry
  | AiTitleEntry
  | ModeEntry
  | PermissionModeEntry
  | LastPromptEntry
  | QueueOperationEntry
  | FileHistorySnapshotEntry
  | StartedEntry
  | ResultEntry
  | UnknownEntry;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isAssistantEntry(entry: Entry): entry is AssistantEntry {
  return entry.type === "assistant";
}

export function isUserEntry(entry: Entry): entry is UserEntry {
  return entry.type === "user";
}

export function isToolUseBlock(block: AssistantContentBlock): block is ToolUseBlock {
  return (block as ToolUseBlock).type === "tool_use";
}

export function isToolResultBlock(block: UserContentBlock): block is ToolResultBlock {
  return (block as ToolResultBlock).type === "tool_result";
}
