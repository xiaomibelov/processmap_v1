import { foldSessionInfo, type SessionInfo } from "./info.js";
import { textBlocks, toolResultBlocks } from "./parser.js";
import { isToolUseBlock } from "./transcript.js";
import type {
  AssistantEntry,
  Entry,
  ToolResultBlock,
  ToolUseBlock,
  UserEntry,
} from "./transcript.js";

export type AgentStatus = "running" | "idle" | "done" | "failed" | "stopped";
export type AgentKind = "main" | "subagent" | "workflowGroup";

export interface ToolCallInfo {
  id: string;
  name: string;
  summary: string | null;
  ts: Date | null;
  status: "pending" | "ok" | "fail";
  input?: unknown;
}

export interface AgentInfo {
  id: string;
  kind: AgentKind;
  interactive: boolean;
  agentType?: string;
  description?: string;
  parentId: string | null;
  spawnedByToolUseId: string | null;
  status: AgentStatus;
  terminal: boolean;
  model?: string;
  toolCalls: ToolCallInfo[];
  outputTokens: number;
  firstTs: Date | null;
  lastTs: Date | null;
  seenRequestIds: Set<string>;
  lastText?: string;
}

export interface SubagentMeta {
  agentId: string;
  workflowId?: string;
  agentType: string;
  description?: string;
  toolUseId?: string;
}

export type UpdateSource =
  | { type: "Main" }
  | { type: "Subagent"; agentId: string }
  | { type: "Journal"; workflowId: string };

export interface EntryUpdate {
  type: "Entry";
  source: UpdateSource;
  entry: Entry;
}

export interface MetaUpdate {
  type: "SubagentMeta";
  source: { type: "Meta" };
  meta: SubagentMeta;
}

export type Update = EntryUpdate | MetaUpdate;

export interface SessionModel {
  sessionId: string;
  agents: Map<string, AgentInfo>;
  spawnOrder: string[];
  sessionInfo: SessionInfo;
  lastActivity: Date | null;
  /** internal join store: toolUseId -> {isError, ts} */
  completedSpawns: Map<string, { isError: boolean; ts: Date }>;
  /** internal join store: agentId -> terminal status */
  taskTerminal: Map<string, AgentStatus>;
  /** internal map of agentId -> terminal status from workflow journal */
  journalDone: Map<string, AgentStatus>;
  /** toolUseId -> current agent id */
  spawnIdToAgentId: Map<string, string>;
}

const INTERACTIVE_IDLE_MS = 120_000;

function entryTimestamp(entry: Entry): string | undefined {
  if ("timestamp" in entry && typeof (entry as Record<string, unknown>).timestamp === "string") {
    return (entry as Record<string, unknown>).timestamp as string;
  }
  return undefined;
}

function entrySessionId(entry: Entry): string | undefined {
  if ("sessionId" in entry && typeof (entry as Record<string, unknown>).sessionId === "string") {
    return (entry as Record<string, unknown>).sessionId as string;
  }
  return undefined;
}

export function createSessionModel(sessionId: string): SessionModel {
  return {
    sessionId,
    agents: new Map(),
    spawnOrder: [],
    sessionInfo: foldSessionInfo(
      { title: null, mode: null, permissionMode: null, lastPrompt: null, queuedOps: 0, fileEdits: 0 },
      { type: "Unknown" }
    ),
    lastActivity: null,
    completedSpawns: new Map(),
    taskTerminal: new Map(),
    journalDone: new Map(),
    spawnIdToAgentId: new Map(),
  };
}

function getOrCreateAgent(
  model: SessionModel,
  id: string,
  kind: AgentKind,
  parentId: string | null,
  spawnedByToolUseId: string | null = null
): AgentInfo {
  let agent = model.agents.get(id);
  if (!agent) {
    agent = {
      id,
      kind,
      interactive: kind === "main",
      parentId,
      spawnedByToolUseId,
      status: "running",
      terminal: false,
      toolCalls: [],
      outputTokens: 0,
      firstTs: null,
      lastTs: null,
      seenRequestIds: new Set(),
    };
    model.agents.set(id, agent);
    if (!model.spawnOrder.includes(id)) model.spawnOrder.push(id);
  }
  return agent;
}

function sourceAgentId(source: UpdateSource): string {
  switch (source.type) {
    case "Main":
      return "main";
    case "Subagent":
      return source.agentId;
    case "Journal":
      return `wf-sub:${source.workflowId}`;
  }
}

function touchAgent(agent: AgentInfo, ts: Date | null): void {
  if (!ts) return;
  if (!agent.firstTs || ts < agent.firstTs) agent.firstTs = ts;
  if (!agent.lastTs || ts > agent.lastTs) agent.lastTs = ts;
}

export function foldUpdate(model: SessionModel, update: Update, now?: Date): void {
  if (update.type === "SubagentMeta") {
    applyMeta(model, update.meta);
  } else {
    applyEntry(model, update.source, update.entry);
  }
  recomputeStatuses(model, now ?? null);
}

function applyMeta(model: SessionModel, meta: SubagentMeta): void {
  const parentId = meta.workflowId ?? "main";
  if (meta.workflowId) {
    getOrCreateAgent(model, meta.workflowId, "workflowGroup", "main");
  }

  let agent: AgentInfo | undefined;

  if (meta.toolUseId) {
    const mapped = model.spawnIdToAgentId.get(meta.toolUseId);
    if (mapped) {
      agent = model.agents.get(mapped);
      if (agent && agent.id !== meta.agentId) {
        renameAgent(model, agent.id, meta.agentId);
        agent = model.agents.get(meta.agentId);
      }
    }
  }

  if (!agent) {
    agent = getOrCreateAgent(model, meta.agentId, "subagent", parentId, meta.toolUseId);
  }

  agent.agentType = meta.agentType;
  if (meta.description) agent.description = meta.description;
  if (meta.toolUseId) {
    agent.spawnedByToolUseId = meta.toolUseId;
    model.spawnIdToAgentId.set(meta.toolUseId, agent.id);
  }
}

function renameAgent(model: SessionModel, oldId: string, newId: string): void {
  const old = model.agents.get(oldId);
  if (!old || oldId === newId) return;
  const existing = model.agents.get(newId);
  if (existing) {
    mergeAgent(model, old, existing);
    model.agents.delete(oldId);
  } else {
    old.id = newId;
    model.agents.set(newId, old);
    model.agents.delete(oldId);
    if (old.spawnedByToolUseId) {
      model.spawnIdToAgentId.set(old.spawnedByToolUseId, newId);
    }
    const idx = model.spawnOrder.indexOf(oldId);
    if (idx >= 0) model.spawnOrder[idx] = newId;
  }
}

function mergeAgent(model: SessionModel, from: AgentInfo, into: AgentInfo): void {
  into.toolCalls.push(...from.toolCalls);
  for (const rid of from.seenRequestIds) into.seenRequestIds.add(rid);
  if (from.outputTokens) into.outputTokens += from.outputTokens;
  if (from.firstTs && (!into.firstTs || from.firstTs < into.firstTs)) into.firstTs = from.firstTs;
  if (from.lastTs && (!into.lastTs || from.lastTs > into.lastTs)) into.lastTs = from.lastTs;
  if (from.agentType && !into.agentType) into.agentType = from.agentType;
  if (from.description && !into.description) into.description = from.description;
  if (from.spawnedByToolUseId) {
    into.spawnedByToolUseId = from.spawnedByToolUseId;
    model.spawnIdToAgentId.set(from.spawnedByToolUseId, into.id);
  }
}

function applyEntry(model: SessionModel, source: UpdateSource, entry: Entry): void {
  if (entry.type === "Unknown") return;

  const tsRaw = entryTimestamp(entry);
  const ts = tsRaw ? new Date(tsRaw) : null;
  if (ts && (!model.lastActivity || ts > model.lastActivity)) model.lastActivity = ts;

  switch (entry.type) {
    case "ai-title":
    case "mode":
    case "permission-mode":
    case "last-prompt":
    case "queue-operation":
    case "file-history-snapshot":
      model.sessionInfo = foldSessionInfo(model.sessionInfo, entry);
      return;
    case "started":
    case "result":
      applyLedger(model, entry, ts);
      return;
  }

  const agentId = sourceAgentId(source);
  let agent = model.agents.get(agentId);

  if (entry.type === "system") {
    applySystem(model, entry as Record<string, unknown>, agentId, ts);
    return;
  }

  if (entry.type === "user" || entry.type === "assistant") {
    if (!agent) {
      if (source.type === "Main") {
        agent = getOrCreateAgent(model, "main", "main", null);
      } else if (source.type === "Subagent") {
        agent = getOrCreateAgent(model, source.agentId, "subagent", "main");
      } else {
        const wfId = source.workflowId;
        getOrCreateAgent(model, wfId, "workflowGroup", "main");
        agent = getOrCreateAgent(model, agentId, "subagent", wfId);
      }
    }
    touchAgent(agent, ts);

    if (entry.type === "assistant") {
      applyAssistant(model, agent, entry, ts);
    } else {
      applyUser(model, agent, entry, ts);
    }
  }
}

function applySystem(
  model: SessionModel,
  record: Record<string, unknown>,
  agentId: string,
  ts: Date | null
): void {
  const subtype = typeof record.subtype === "string" ? record.subtype : "";
  if (/task[-_]?notification/i.test(subtype)) {
    const targetId = typeof record.agentId === "string" ? record.agentId : agentId;
    const result = typeof record.result === "string" ? record.result : typeof record.status === "string" ? record.status : "";
    const status = terminalStatusFromString(result);
    if (status) {
      model.taskTerminal.set(targetId, status);
      const agent = model.agents.get(targetId);
      if (agent) {
        agent.status = status;
        agent.terminal = true;
        touchAgent(agent, ts);
      }
    }
  }
}

function terminalStatusFromString(value: string): AgentStatus | null {
  const v = value.toLowerCase();
  if (v === "completed" || v === "done" || v === "success") return "done";
  if (v === "stopped" || v === "cancelled") return "stopped";
  if (v === "failed" || v === "error" || v === "failure") return "failed";
  return null;
}

function applyLedger(
  model: SessionModel,
  entry: { type: "started" | "result"; agentId: string; result?: string },
  ts: Date | null
): void {
  if (entry.type === "result") {
    const status = terminalStatusFromString(entry.result ?? "");
    if (status) {
      model.journalDone.set(entry.agentId, status);
      const agent = model.agents.get(entry.agentId);
      if (agent) {
        agent.status = status;
        agent.terminal = true;
        touchAgent(agent, ts);
      }
    }
  }
}

function applyAssistant(model: SessionModel, agent: AgentInfo, entry: AssistantEntry, ts: Date | null): void {
  if (entry.message.model) agent.model = entry.message.model;
  if (entry.requestId && entry.message.usage?.output_tokens) {
    if (!agent.seenRequestIds.has(entry.requestId)) {
      agent.seenRequestIds.add(entry.requestId);
      agent.outputTokens += entry.message.usage.output_tokens;
    }
  }

  const texts = textBlocks(entry);
  if (texts.length > 0) agent.lastText = texts.map((t) => t.text).join("\n");

  for (const block of entry.message.content) {
    if (isToolUseBlock(block)) {
      addToolCall(model, agent, block, ts);
      if (block.name === "Agent" || block.name === "Workflow") {
        handleSpawnToolUse(model, agent, block);
      }
    }
  }
}

function addToolCall(_model: SessionModel, agent: AgentInfo, block: ToolUseBlock, ts: Date | null): void {
  const existing = agent.toolCalls.find((t) => t.id === block.id);
  if (existing) {
    existing.name = block.name;
    existing.input = block.input;
    if (ts) existing.ts = ts;
    return;
  }
  agent.toolCalls.push({
    id: block.id,
    name: block.name,
    summary: summarizeToolInput(block.name, block.input),
    ts,
    status: "pending",
    input: block.input,
  });
}

function handleSpawnToolUse(model: SessionModel, agent: AgentInfo, block: ToolUseBlock): void {
  const input = (block.input ?? {}) as Record<string, unknown>;
  const description = typeof input.description === "string" ? input.description : undefined;
  const agentType =
    typeof input.subagent_type === "string"
      ? input.subagent_type
      : block.name === "Workflow"
      ? "workflow"
      : undefined;

  if (block.name === "Workflow") {
    const wf = getOrCreateAgent(model, block.id, "workflowGroup", agent.id);
    wf.agentType = agentType ?? wf.agentType;
    wf.description = description ?? wf.description;
    wf.spawnedByToolUseId = block.id;
    model.spawnIdToAgentId.set(block.id, block.id);
    return;
  }

  const existing = model.spawnIdToAgentId.get(block.id);
  if (existing) {
    const sub = model.agents.get(existing);
    if (sub) {
      sub.spawnedByToolUseId = block.id;
      if (description) sub.description = description;
      if (agentType) sub.agentType = agentType;
    }
    return;
  }

  const sub = getOrCreateAgent(model, block.id, "subagent", agent.id, block.id);
  sub.agentType = agentType ?? sub.agentType;
  sub.description = description ?? sub.description;
  model.spawnIdToAgentId.set(block.id, block.id);
}

function applyUser(model: SessionModel, agent: AgentInfo, entry: UserEntry, ts: Date | null): void {
  const results = toolResultBlocks(entry);
  for (const result of results) {
    resolveToolResult(model, agent, result, ts);
  }
}

function resolveToolResult(
  model: SessionModel,
  sourceAgent: AgentInfo,
  result: ToolResultBlock,
  ts: Date | null
): void {
  const isError = result.is_error === true;
  const toolUseId = result.tool_use_id;

  let call = sourceAgent.toolCalls.find((t) => t.id === toolUseId);
  if (!call) {
    for (const other of model.agents.values()) {
      call = other.toolCalls.find((t) => t.id === toolUseId);
      if (call) break;
    }
  }

  if (call) {
    call.status = isError ? "fail" : "ok";
    if (ts) call.ts = ts;
  } else {
    call = {
      id: toolUseId,
      name: "tool",
      summary: null,
      ts,
      status: isError ? "fail" : "ok",
    };
    sourceAgent.toolCalls.push(call);
  }

  if (call.name === "Agent" || call.name === "Workflow") {
    const spawnId = toolUseId;
    model.completedSpawns.set(spawnId, { isError, ts: ts ?? new Date() });
    const spawnedId = model.spawnIdToAgentId.get(spawnId);
    if (spawnedId) {
      const spawned = model.agents.get(spawnedId);
      if (spawned && !spawned.terminal) {
        // terminal resolution happens in recomputeStatuses
      }
    }
  }
}

function summarizeToolInput(name: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  if (name === "Bash" && typeof rec.command === "string") return rec.command.slice(0, 60);
  if (name === "Read" && typeof rec.file_path === "string") return rec.file_path.slice(0, 60);
  if (name === "Write" && typeof rec.file_path === "string") return rec.file_path.slice(0, 60);
  if (name === "Edit" && typeof rec.old_string === "string") return rec.old_string.slice(0, 40).replace(/\s+/g, " ");
  if (typeof rec.description === "string") return rec.description.slice(0, 60);
  return null;
}

function recomputeStatuses(model: SessionModel, now: Date | null): void {
  let changed = true;
  for (let guard = 0; guard < 10 && changed; guard++) {
    changed = false;
    for (const agent of model.agents.values()) {
      const next = computeAgentStatus(agent, model, now);
      if (agent.status !== next.status || agent.terminal !== next.terminal) {
        agent.status = next.status;
        agent.terminal = next.terminal;
        changed = true;
      }
    }
  }
}

function computeAgentStatus(
  agent: AgentInfo,
  model: SessionModel,
  now: Date | null
): { status: AgentStatus; terminal: boolean } {
  const task = model.taskTerminal.get(agent.id);
  if (task) return { status: task, terminal: true };

  const journalStatus = model.journalDone.get(agent.id);
  if (journalStatus) return { status: journalStatus, terminal: true };

  const spawnId = agent.spawnedByToolUseId;
  if (spawnId) {
    const ack = model.completedSpawns.get(spawnId);
    if (ack) {
      const superseded = agent.lastTs ? ack.ts < agent.lastTs : false;
      if (!superseded) {
        return { status: ack.isError ? "failed" : "done", terminal: true };
      }
    }
  }

  if (agent.kind === "workflowGroup") {
    const children = [...model.agents.values()].filter((a) => a.parentId === agent.id);
    if (children.length === 0) return { status: "running", terminal: false };
    const allTerminal = children.every((c) => c.terminal);
    if (!allTerminal) return { status: "running", terminal: false };
    const anyFailed = children.some((c) => c.status === "failed");
    return { status: anyFailed ? "failed" : "done", terminal: true };
  }

  const active = isActive(agent, now);
  if (agent.interactive) return { status: active ? "running" : "idle", terminal: false };
  return { status: active ? "running" : "done", terminal: false };
}

function isActive(agent: AgentInfo, now: Date | null): boolean {
  const hasPending = agent.toolCalls.some((t) => t.status === "pending");
  if (hasPending) return true;
  if (!now || !agent.lastTs) return false;
  return now.getTime() - agent.lastTs.getTime() <= INTERACTIVE_IDLE_MS;
}

export function rebuild(updates: Update[], now?: Date): SessionModel {
  let sessionId = "session";
  for (const update of updates) {
    if (update.type === "Entry") {
      const fromEntry = entrySessionId(update.entry);
      if (fromEntry) {
        sessionId = fromEntry;
        break;
      }
    }
  }
  const model = createSessionModel(sessionId);
  for (const update of updates) {
    foldUpdate(model, update, now);
  }
  return model;
}

export function cloneModel(model: SessionModel): SessionModel {
  const clone = createSessionModel(model.sessionId);
  clone.sessionInfo = { ...model.sessionInfo };
  clone.lastActivity = model.lastActivity ? new Date(model.lastActivity) : null;
  clone.spawnOrder = [...model.spawnOrder];
  for (const [k, v] of model.completedSpawns) clone.completedSpawns.set(k, { ...v });
  for (const [k, v] of model.taskTerminal) clone.taskTerminal.set(k, v);
  for (const [k, v] of model.journalDone) clone.journalDone.set(k, v);
  for (const [k, v] of model.spawnIdToAgentId) clone.spawnIdToAgentId.set(k, v);
  for (const [k, v] of model.agents) {
    clone.agents.set(k, {
      ...v,
      toolCalls: v.toolCalls.map((t) => ({ ...t })),
      seenRequestIds: new Set(v.seenRequestIds),
    });
  }
  return clone;
}
