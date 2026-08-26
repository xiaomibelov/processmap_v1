#!/usr/bin/env node
import { claude } from "agent-flow-core";
import { buildReplay, loadSession, type ReplayPackage } from "./loader.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inspectIdx = args.findIndex((a) => a === "--inspect");
  const target = inspectIdx >= 0 ? args[inspectIdx + 1] : args[0];

  if (!target || args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: agent-flow-visual --inspect <session.jsonl|project-dir>

Prints a Claude Code session tree without starting the UI.`);
    process.exit(target ? 0 : 1);
  }

  try {
    const pkg = target.endsWith(".jsonl") ? await buildReplay(target) : await loadSession(target);
    const model = claude.rebuild(
      pkg.items.map((i) => i.update),
      pkg.items.length ? claude.itemTs(pkg.items[pkg.items.length - 1]) ?? undefined : undefined
    );
    printTree(pkg, model);
    process.exit(0);
  } catch (err) {
    console.error("inspect failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function printTree(pkg: ReplayPackage, model: claude.SessionModel): void {
  const info = pkg.info;
  console.log(`Session: ${info.title ?? pkg.sessionId}`);
  console.log(
    `Mode: ${info.mode ?? "—"} · Permission: ${info.permissionMode ?? "—"} · Queued: ${info.queuedOps} · File edits: ${info.fileEdits}`
  );

  const agents = [...model.agents.values()];
  const tools = agents.reduce((s, a) => s + a.toolCalls.length, 0);
  console.log(`Agents: ${agents.length} · Tool calls: ${tools}`);
  console.log();

  const main = model.agents.get("main");
  if (!main) {
    console.log("(no main agent)");
    return;
  }

  console.log(formatAgent(main));
  const direct = agents.filter((a) => a.parentId === "main").sort(spawnOrder(model));
  for (const child of direct) {
    printAgent(child, model, "  ");
  }
}

function printAgent(agent: claude.AgentInfo, model: claude.SessionModel, indent: string): void {
  console.log(`${indent}${formatAgent(agent)}`);
  if (agent.kind === "workflowGroup") {
    const subs = [...model.agents.values()]
      .filter((a) => a.parentId === agent.id)
      .sort(spawnOrder(model));
    for (const sub of subs) {
      printAgent(sub, model, `${indent}  `);
    }
  }
}

function formatAgent(agent: claude.AgentInfo): string {
  const label = agent.agentType ?? agent.id;
  const tokens = agent.outputTokens > 0 ? ` · ${formatTokens(agent.outputTokens)} tok` : "";
  return `${label} — ${agent.status}${tokens}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function spawnOrder(model: claude.SessionModel) {
  return (a: claude.AgentInfo, b: claude.AgentInfo) =>
    model.spawnOrder.indexOf(a.id) - model.spawnOrder.indexOf(b.id);
}

main();
